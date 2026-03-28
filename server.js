import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Sequelize, DataTypes } from 'sequelize';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Set up Sequelize ORM to abstract the database perfectly so it runs locally (SQLite) and seamlessly on Free Render Servers with PostgreSQL natively forever!
let sequelize;
if (process.env.DATABASE_URL) {
    // Production mapping for standard Free Serverless PostgreSQL like Neon or Supabase! Simply paste the DATABASE_URL environment variable in your Render dashboard!
    sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        },
        logging: false
    });
} else {
    if (process.env.RENDER) {
        console.error("\n==========================================================");
        console.error("⛔ CRITICAL ERROR: NO DATABASE_URL CONFIGURED!");
        console.error("You are deploying to Render but forgot to add the PostgreSQL");
        console.error("DATABASE_URL in the Environment Variables tab.");
        console.error("Your app will intentionally pause here until you add it,");
        console.error("because free-tier cannot permanently save your flashcards.");
        console.error("==========================================================\n");
        process.exit(1);
    }

    // Local Development SQLite mapping fallback
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: 'database.sqlite',
        logging: false
    });
}

// ======================== DEFINE TABLES ========================
const Folder = sequelize.define('folder', {
    name: { type: DataTypes.STRING, allowNull: false },
    createdAt: { type: DataTypes.BIGINT }
}, { timestamps: false });

const Set = sequelize.define('set', {
    title: { type: DataTypes.STRING, allowNull: false },
    folderId: { type: DataTypes.INTEGER, allowNull: true },
    parentSetId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: { type: DataTypes.BIGINT }
}, { timestamps: false });

const Card = sequelize.define('card', {
    setId: { type: DataTypes.INTEGER, allowNull: false },
    front: { type: DataTypes.TEXT },
    back: { type: DataTypes.TEXT },
    createdAt: { type: DataTypes.BIGINT }
}, { timestamps: false });

// Helper for recursive deletion
async function deleteSetRecursively(setId) {
    // Delete cards in this set
    await Card.destroy({ where: { setId } });

    // Find child sets
    const childSets = await Set.findAll({ where: { parentSetId: setId } });
    for (const s of childSets) {
        await deleteSetRecursively(s.id);
    }

    // Delete the set itself
    await Set.destroy({ where: { id: setId } });
}

// Initialize database without erasing existing data
sequelize.sync({ alter: true }).then(() => console.log('Database synced perfectly across whatever adapter is detected!'));

// ======================== API ENDPOINTS ========================

// Folders
app.get('/api/folders', async (req, res) => {
    res.json(await Folder.findAll());
});
app.post('/api/folders', async (req, res) => {
    const f = await Folder.create(req.body);
    res.json({ id: f.id });
});
app.put('/api/folders/:id', async (req, res) => {
    await Folder.update(req.body, { where: { id: req.params.id } });
    res.json({ success: true });
});
app.delete('/api/folders/:id', async (req, res) => {
    const folderId = req.params.id;
    const sets = await Set.findAll({ where: { folderId } });
    for (const s of sets) {
        await deleteSetRecursively(s.id);
    }
    await Folder.destroy({ where: { id: folderId } });
    res.json({ success: true });
});

// Sets
app.get('/api/sets', async (req, res) => {
    res.json(await Set.findAll());
});
app.get('/api/sets/folder/:folderId', async (req, res) => {
    res.json(await Set.findAll({ where: { folderId: req.params.folderId } }));
});
app.get('/api/sets/:id', async (req, res) => {
    res.json((await Set.findByPk(req.params.id)) || null);
});
app.post('/api/sets', async (req, res) => {
    const s = await Set.create(req.body);
    res.json({ id: s.id });
});
app.put('/api/sets/:id', async (req, res) => {
    await Set.update(req.body, { where: { id: req.params.id } });
    res.json({ success: true });
});
app.delete('/api/sets/:id', async (req, res) => {
    await deleteSetRecursively(req.params.id);
    res.json({ success: true });
});

// Cards
app.get('/api/cards/set/:setId', async (req, res) => {
    res.json(await Card.findAll({ where: { setId: req.params.setId } }));
});
app.post('/api/cards', async (req, res) => {
    const c = await Card.create(req.body);
    res.json({ id: c.id });
});
app.put('/api/cards/:id', async (req, res) => {
    await Card.update(req.body, { where: { id: req.params.id } });
    res.json({ success: true });
});
app.delete('/api/cards/:id', async (req, res) => {
    await Card.destroy({ where: { id: req.params.id } });
    res.json({ success: true });
});

// ======================== SERVE FRONTEND OUT OF DIST ========================
app.use(express.static(join(__dirname, 'dist')));

// ======================== RENDER KEEP-ALIVE ========================
// Prevent the free tier from sleeping after 15 minutes of inactivity
app.get('/api/keepalive', (req, res) => {
    res.status(200).send('Alive');
});

if (process.env.RENDER_EXTERNAL_URL) {
    setInterval(() => {
        https.get(`${process.env.RENDER_EXTERNAL_URL}/api/keepalive`, (resp) => {
            console.log(`[Keep-Alive] Pinged ${process.env.RENDER_EXTERNAL_URL} - Status: ${resp.statusCode}`);
        }).on("error", (err) => {
            console.error(`[Keep-Alive] Ping failed:`, err.message);
        });
    }, 14 * 60 * 1000); // 14 minutes
}

// SPA Catch-all (using app.use instead of app.get('*') to avoid Express path-to-regexp wildcard parsing errors)
app.use((req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Backend API + Static server running brilliantly on port ${PORT}`);
});
