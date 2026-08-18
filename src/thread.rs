//! One OS thread per connection.
//!
//! The Actian/Ingres driver keeps session state per thread and deadlocks when a
//! connection-level call arrives from a thread other than the one that used the
//! session, so every ODBC call for a connection — including `SQLDriverConnect`
//! and the final `SQLDisconnect` — runs here. See `docs/rustPort.md`.
//!
//! The thread owns the session outright rather than sharing it behind a lock,
//! which is what makes the affinity a compile-time property instead of a
//! convention.

use crate::error::{OdbcFailure, OdbcResult};
use crate::session::Session;
use std::collections::VecDeque;
use std::sync::mpsc::channel;
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{JoinHandle, ThreadId};

/// The session is absent until `connect` succeeds, and again after `close`.
pub type SessionSlot = Option<Session>;

type Job = Box<dyn FnOnce(&mut SessionSlot) + Send>;

pub struct OdbcThread {
    shared: Arc<Shared>,
    worker: Mutex<Option<JoinHandle<()>>>,
    worker_id: ThreadId,
}

struct Shared {
    queue: Mutex<Queue>,
    work_available: Condvar,
}

#[derive(Default)]
struct Queue {
    jobs: VecDeque<Job>,
    running_job: bool,
    stopped: bool,
}

impl OdbcThread {
    pub fn spawn() -> OdbcResult<Self> {
        let shared = Arc::new(Shared {
            queue: Mutex::new(Queue::default()),
            work_available: Condvar::new(),
        });

        let worker_shared = Arc::clone(&shared);
        let worker = std::thread::Builder::new()
            .name("odbc-connection".to_owned())
            .spawn(move || serve(&worker_shared))
            .map_err(|error| {
                OdbcFailure::new(format!(
                    "Failed to start the ODBC connection thread: {error}."
                ))
            })?;

        let worker_id = worker.thread().id();
        Ok(Self {
            shared,
            worker: Mutex::new(Some(worker)),
            worker_id,
        })
    }

    /// Queue work and return immediately. The job reports its own outcome, in
    /// practice by calling back into JavaScript through a threadsafe function.
    pub fn enqueue(&self, job: impl FnOnce(&mut SessionSlot) + Send + 'static) -> OdbcResult<()> {
        let mut queue = self.shared.queue.lock().expect("ODBC queue poisoned");
        if queue.stopped {
            return Err(OdbcFailure::new("The connection is closed."));
        }
        queue.jobs.push_back(Box::new(job));
        self.shared.work_available.notify_one();
        Ok(())
    }

    /// Run work only when the thread is idle, and never queue behind anything.
    ///
    /// Synchronous getters use this: making a property read wait for an
    /// in-flight query would stall Node's main thread for the length of that
    /// query. `None` means "ask someone else", not "failed".
    pub fn run_if_idle<T: Send + 'static>(
        &self,
        job: impl FnOnce(&mut SessionSlot) -> T + Send + 'static,
    ) -> Option<T> {
        let (sender, receiver) = channel();
        {
            let mut queue = self.shared.queue.lock().expect("ODBC queue poisoned");
            if queue.stopped || queue.running_job || !queue.jobs.is_empty() {
                return None;
            }
            queue.jobs.push_back(Box::new(move |session| {
                let _ = sender.send(job(session));
            }));
            self.shared.work_available.notify_one();
        }
        receiver.recv().ok()
    }

    /// Run work on the thread and wait for it, queueing behind whatever is
    /// already pending.
    pub fn run<T: Send + 'static>(
        &self,
        job: impl FnOnce(&mut SessionSlot) -> T + Send + 'static,
    ) -> OdbcResult<T> {
        let (sender, receiver) = channel();
        self.enqueue(move |session| {
            let _ = sender.send(job(session));
        })?;
        receiver
            .recv()
            .map_err(|_| OdbcFailure::new("The ODBC connection thread stopped unexpectedly."))
    }

    /// Stop accepting work, let what is already queued finish, and join.
    ///
    /// Joining matters: the driver only releases its per-thread session state
    /// once the thread is gone, so a later connection-level call from another
    /// thread would otherwise still deadlock.
    pub fn stop(&self) {
        {
            let mut queue = self.shared.queue.lock().expect("ODBC queue poisoned");
            if !queue.stopped {
                queue.stopped = true;
                self.shared.work_available.notify_all();
            }
        }

        // A job can hold the last reference to this thread, in which case the
        // drop that calls us runs *on* the worker. Joining there would be the
        // thread waiting for itself; it is already on its way out, so leaving
        // it to finish is both correct and all we can do.
        if std::thread::current().id() == self.worker_id {
            return;
        }

        let worker = self.worker.lock().expect("ODBC worker poisoned").take();
        if let Some(worker) = worker {
            let _ = worker.join();
        }
    }
}

impl Drop for OdbcThread {
    fn drop(&mut self) {
        self.stop();
    }
}

fn serve(shared: &Shared) {
    let mut session: SessionSlot = None;
    while let Some(job) = next_job(shared) {
        job(&mut session);
        shared
            .queue
            .lock()
            .expect("ODBC queue poisoned")
            .running_job = false;
    }
}

fn next_job(shared: &Shared) -> Option<Job> {
    let mut queue = shared.queue.lock().expect("ODBC queue poisoned");
    loop {
        if let Some(job) = queue.jobs.pop_front() {
            queue.running_job = true;
            return Some(job);
        }
        if queue.stopped {
            return None;
        }
        queue = shared
            .work_available
            .wait(queue)
            .expect("ODBC queue poisoned");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    #[test]
    fn runs_every_job_on_one_thread() {
        let thread = OdbcThread::spawn().expect("no ODBC thread");
        let first = thread
            .run(|_| std::thread::current().id())
            .expect("no result");
        let second = thread
            .run(|_| std::thread::current().id())
            .expect("no result");
        assert_eq!(first, second);
        assert_ne!(first, std::thread::current().id());
    }

    #[test]
    fn keeps_jobs_in_order() {
        let thread = OdbcThread::spawn().expect("no ODBC thread");
        let order = Arc::new(Mutex::new(Vec::new()));
        for index in 0..16 {
            let order = Arc::clone(&order);
            thread
                .enqueue(move |_| order.lock().unwrap().push(index))
                .expect("not queued");
        }
        thread.run(|_| ()).expect("no result");
        assert_eq!(*order.lock().unwrap(), (0..16).collect::<Vec<_>>());
    }

    #[test]
    fn refuses_to_queue_behind_a_busy_thread() {
        let thread = OdbcThread::spawn().expect("no ODBC thread");
        let released = Arc::new((Mutex::new(false), Condvar::new()));

        let blocker = Arc::clone(&released);
        thread
            .enqueue(move |_| {
                let (lock, signal) = &*blocker;
                let mut done = lock.lock().unwrap();
                while !*done {
                    done = signal.wait(done).unwrap();
                }
            })
            .expect("not queued");

        std::thread::sleep(Duration::from_millis(50));
        assert!(thread.run_if_idle(|_| 1).is_none());

        let (lock, signal) = &*released;
        *lock.lock().unwrap() = true;
        signal.notify_all();

        thread.run(|_| ()).expect("no result");
        assert_eq!(eventually_idle(&thread), Some(1));
    }

    /// The worker marks itself free only after the job it ran has returned, and
    /// a job delivers its result before returning, so a caller can briefly see
    /// the thread as busy after its own work finished. `run_if_idle` is
    /// best-effort by design — its caller falls back to a cached answer — so
    /// what matters is that the thread becomes available again.
    fn eventually_idle(thread: &OdbcThread) -> Option<i32> {
        for _ in 0..100 {
            if let Some(value) = thread.run_if_idle(|_| 1) {
                return Some(value);
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        None
    }

    #[test]
    fn rejects_work_after_stopping() {
        let thread = OdbcThread::spawn().expect("no ODBC thread");
        let ran = Arc::new(AtomicUsize::new(0));

        let counter = Arc::clone(&ran);
        thread
            .enqueue(move |_| {
                counter.fetch_add(1, Ordering::SeqCst);
            })
            .expect("not queued");
        thread.stop();

        assert_eq!(ran.load(Ordering::SeqCst), 1);
        assert!(thread.enqueue(|_| ()).is_err());
        assert!(thread.run_if_idle(|_| 1).is_none());
    }

    /// A job can hold the last reference to the thread it runs on, so the drop
    /// happens on the worker itself. Joining there is the thread waiting for
    /// itself, which aborts the process with EDEADLK.
    #[test]
    fn a_job_may_drop_the_last_reference_to_its_own_thread() {
        let thread = Arc::new(OdbcThread::spawn().expect("no ODBC thread"));
        let finished = Arc::new((Mutex::new(false), Condvar::new()));

        let owned = Arc::clone(&thread);
        let signal = Arc::clone(&finished);
        thread
            .enqueue(move |_| {
                drop(owned);
                let (lock, condvar) = &*signal;
                *lock.lock().unwrap() = true;
                condvar.notify_all();
            })
            .expect("not queued");

        drop(thread);

        let (lock, condvar) = &*finished;
        let mut done = lock.lock().unwrap();
        while !*done {
            let (guard, timeout) = condvar.wait_timeout(done, Duration::from_secs(5)).unwrap();
            done = guard;
            assert!(!timeout.timed_out(), "the job never ran");
        }
    }

    #[test]
    fn stopping_twice_is_harmless() {
        let thread = OdbcThread::spawn().expect("no ODBC thread");
        thread.stop();
        thread.stop();
    }
}
