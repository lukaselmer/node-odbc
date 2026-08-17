package odbc

// Cursor hands a result set back in batches instead of materialising all of it.
type Cursor struct {
	statement  *statement
	parameters []any
}

func newCursor(statement *statement) *Cursor {
	return &Cursor{statement: statement}
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
	if err := c.statement.closeCursor(); err != nil {
		c.statement.free()
		return err
	}
	c.statement.free()
	return nil
}
