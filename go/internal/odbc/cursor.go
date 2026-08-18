package odbc

// Cursor hands a result set back in batches instead of materialising all of it.
//
// A cursor opened by a query owns its statement, while one opened by a
// prepared statement only borrows it: closing that cursor has to leave the
// statement ready to execute again.
type Cursor struct {
	statement     *statement
	parameters    []any
	ownsStatement bool
}

func newOwningCursor(statement *statement) *Cursor {
	return &Cursor{statement: statement, ownsStatement: true}
}

func newBorrowingCursor(statement *statement, parameters []any) *Cursor {
	return &Cursor{statement: statement, parameters: parameters}
}

func (c *Cursor) NoData() bool { return c.statement.noData }

// Fetch returns the next batch. Reaching the end is not an error: the batch is
// empty and NoData reports true.
func (c *Cursor) Fetch() (*Result, error) {
	rows, _, err := c.statement.fetchBatch()
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []any{}
	}
	return c.statement.newResult(rows, c.parameters), nil
}

func (c *Cursor) Close() error {
	err := c.statement.closeCursor()
	if c.ownsStatement {
		c.statement.free()
	} else {
		c.statement.releaseBuffers()
	}
	return err
}
