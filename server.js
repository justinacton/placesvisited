const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize SQLite database
const db = new sqlite3.Database('maps.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        
        // Create tables if they don't exist
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS maps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            states TEXT NOT NULL,
            is_public BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);
    }
});

// Auth endpoints
app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body;
    
    db.run('INSERT INTO users (email, password) VALUES (?, ?)',
        [email, password], // Note: In production, hash the password!
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    res.status(400).json({ error: 'Email already exists' });
                } else {
                    res.status(500).json({ error: 'Error creating user' });
                }
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get('SELECT * FROM users WHERE email = ? AND password = ?',
        [email, password], // Note: In production, verify hashed password!
        (err, user) => {
            if (err) {
                res.status(500).json({ error: 'Error during login' });
                return;
            }
            if (!user) {
                res.status(401).json({ error: 'Invalid credentials' });
                return;
            }
            res.json({ id: user.id, email: user.email });
        }
    );
});

// Map endpoints
app.post('/api/maps', (req, res) => {
    const { userId, title, states, isPublic } = req.body;
    
    db.run(`INSERT INTO maps (user_id, title, states, is_public) 
            VALUES (?, ?, ?, ?)`,
        [userId, title, JSON.stringify(states), isPublic ? 1 : 0],
        function(err) {
            if (err) {
                res.status(500).json({ error: 'Error saving map' });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/maps/:id', (req, res) => {
    const { title, states, isPublic } = req.body;
    const mapId = req.params.id;
    
    db.run(`UPDATE maps 
            SET title = ?, states = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?`,
        [title, JSON.stringify(states), isPublic ? 1 : 0, mapId],
        (err) => {
            if (err) {
                res.status(500).json({ error: 'Error updating map' });
                return;
            }
            res.json({ success: true });
        }
    );
});

app.get('/api/maps/:id', (req, res) => {
    const mapId = req.params.id;
    
    db.get(`SELECT m.*, u.email as creator_email 
            FROM maps m 
            LEFT JOIN users u ON m.user_id = u.id 
            WHERE m.id = ?`,
        [mapId],
        (err, map) => {
            if (err) {
                res.status(500).json({ error: 'Error loading map' });
                return;
            }
            if (!map) {
                res.status(404).json({ error: 'Map not found' });
                return;
            }
            
            // Parse states from JSON string
            map.states = JSON.parse(map.states);
            res.json(map);
        }
    );
});

app.get('/api/users/:userId/maps', (req, res) => {
    const userId = req.params.userId;
    
    db.all('SELECT * FROM maps WHERE user_id = ? ORDER BY updated_at DESC',
        [userId],
        (err, maps) => {
            if (err) {
                res.status(500).json({ error: 'Error loading maps' });
                return;
            }
            res.json(maps);
        }
    );
});

// Add this with the other endpoints
app.get('/api/health-check', (req, res) => {
    res.json({ status: 'ok' });
});

// Add this near the top of the file, after initializing the app
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Add this at the bottom of the file, just before app.listen
// Handle 404 errors
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Add a route for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Add a route for the shared view
app.get('/shared', (req, res) => {
    res.sendFile(path.join(__dirname, 'shared.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 