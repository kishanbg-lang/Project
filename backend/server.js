require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const pool = require('./db');
const authMiddleware = require('./authMiddleware');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the frontend static files so the whole app runs from one server
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const PORT = process.env.PORT || 3000;

/* ---------------------------- AUTH ROUTES ---------------------------- */

// Register a new student
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }

    const [existing] = await pool.query('SELECT id FROM students WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO students (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );

    const token = jwt.sign({ id: result.insertId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, student: { id: result.insertId, name, email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const [rows] = await pool.query('SELECT * FROM students WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const student = rows[0];
    const match = await bcrypt.compare(password, student.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ id: student.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, student: { id: student.id, name: student.name, email: student.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

/* ------------------------- ASSIGNMENT ROUTES -------------------------- */
/* All routes below require a valid JWT (authMiddleware) so a student only
   ever sees or modifies their own assignments. */

// Get all assignments for the logged-in student (with computed status helpers)
app.get('/api/assignments', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM assignments WHERE student_id = ? ORDER BY due_date ASC',
      [req.studentId]
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enriched = rows.map((a) => {
      const due = new Date(a.due_date);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
      const isOverdue = a.status !== 'COMPLETED' && diffDays < 0;
      return { ...a, days_remaining: diffDays, is_overdue: isOverdue };
    });

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch assignments.' });
  }
});

// Create a new assignment
app.post('/api/assignments', authMiddleware, async (req, res) => {
  try {
    const { subject, title, description, due_date, priority } = req.body;
    if (!subject || !title || !due_date) {
      return res.status(400).json({ error: 'Subject, title and due date are required.' });
    }

    const [result] = await pool.query(
      `INSERT INTO assignments (student_id, subject, title, description, due_date, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
      [req.studentId, subject, title, description || '', due_date, priority || 'MEDIUM']
    );

    res.status(201).json({ id: result.insertId, message: 'Assignment created.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create assignment.' });
  }
});

// Update (edit) an assignment
app.put('/api/assignments/:id', authMiddleware, async (req, res) => {
  try {
    const { subject, title, description, due_date, priority, status } = req.body;

    const [result] = await pool.query(
      `UPDATE assignments
       SET subject = ?, title = ?, description = ?, due_date = ?, priority = ?, status = ?
       WHERE id = ? AND student_id = ?`,
      [subject, title, description, due_date, priority, status, req.params.id, req.studentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }
    res.json({ message: 'Assignment updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update assignment.' });
  }
});

// Mark an assignment as completed
app.put('/api/assignments/:id/complete', authMiddleware, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE assignments SET status = 'COMPLETED' WHERE id = ? AND student_id = ?`,
      [req.params.id, req.studentId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }
    res.json({ message: 'Assignment marked as completed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update assignment.' });
  }
});

// Delete an assignment
app.delete('/api/assignments/:id', authMiddleware, async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM assignments WHERE id = ? AND student_id = ?',
      [req.params.id, req.studentId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }
    res.json({ message: 'Assignment deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete assignment.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
