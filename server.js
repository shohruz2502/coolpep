const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Инициализация приложения
const app = express();

// Конфигурация
const PORT = process.env.PORT || 3000;

// Подключение к PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_fake_password@ep-fake-host.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Создаем папку для загрузок если её нет
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'videos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Настройка multer для загрузки видео
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB максимум
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|mov|avi|wmv|flv|mkv|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    if (extname) {
      return cb(null, true);
    } else {
      cb(new Error('Только видео файлы разрешены!'));
    }
  }
});

// Автоматически создаем таблицы при запуске
async function initializeDatabase() {
  try {
    await pool.query(`
      -- Таблица пользователей
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        surname VARCHAR(100),
        bio TEXT,
        gender VARCHAR(20),
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Таблица друзей
      CREATE TABLE IF NOT EXISTS friends (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        friend_id UUID NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, friend_id)
      );
      
      -- Таблица сообществ
      CREATE TABLE IF NOT EXISTS communities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        is_private BOOLEAN DEFAULT false,
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Таблица участников сообществ
      CREATE TABLE IF NOT EXISTS community_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        community_id UUID NOT NULL,
        user_id UUID NOT NULL,
        role VARCHAR(20) DEFAULT 'member',
        is_muted BOOLEAN DEFAULT false,
        mute_reason TEXT,
        muted_by UUID,
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(community_id, user_id)
      );
      
      -- Таблица сообщений сообществ
      CREATE TABLE IF NOT EXISTS community_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        community_id UUID NOT NULL,
        user_id UUID NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Таблица личных сообщений
      CREATE TABLE IF NOT EXISTS private_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id UUID NOT NULL,
        receiver_id UUID NOT NULL,
        content TEXT NOT NULL,
        is_anonymous BOOLEAN DEFAULT false,
        anonymous_avatar TEXT,
        anonymous_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Таблица Reels
      CREATE TABLE IF NOT EXISTS reels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        video_url VARCHAR(500) NOT NULL,
        video_filename VARCHAR(255) NOT NULL,
        thumbnail_url VARCHAR(500),
        caption TEXT,
        music VARCHAR(255),
        likes_count INTEGER DEFAULT 0,
        views_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Таблица лайков Reels
      CREATE TABLE IF NOT EXISTS reel_likes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reel_id UUID NOT NULL,
        user_id UUID NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(reel_id, user_id)
      );
      
      -- Таблица постов ленты
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        content TEXT NOT NULL,
        community_id UUID,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Таблица LOVE чатов
      CREATE TABLE IF NOT EXISTS love_chats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user1_id UUID NOT NULL,
        user2_id UUID NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Таблица сообщений LOVE чатов
      CREATE TABLE IF NOT EXISTS love_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        love_chat_id UUID NOT NULL,
        sender_id UUID NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('✅ Таблицы базы данных созданы/проверены');
    
    // Создаем тестового пользователя если нет пользователей
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(usersCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO users (id, phone, name, surname, bio, gender, avatar_url) 
        VALUES 
          ('11111111-1111-1111-1111-111111111111', '+79991234567', 'Иван', 'Иванов', 'Люблю путешествия и спорт', 'male', ''),
          ('22222222-2222-2222-2222-222222222222', '+79997654321', 'Анна', 'Петрова', 'Кофеман и дизайнер', 'female', ''),
          ('33333333-3333-3333-3333-333333333333', '+79995556677', 'Дмитрий', 'Сидоров', 'Фитнес тренер', 'male', ''),
          ('44444444-4444-4444-4444-444444444444', '+79998889900', 'Мария', 'Козлова', 'Художник и иллюстратор', 'female', '')
        ON CONFLICT (phone) DO NOTHING
      `);
      console.log('✅ Тестовые пользователи созданы');
    }
    
    // Создаем тестовые Reels если их нет
    const reelsCount = await pool.query('SELECT COUNT(*) FROM reels');
    if (parseInt(reelsCount.rows[0].count) === 0) {
      // Создаем тестовые демо-видео (используем ссылки на бесплатные видео)
      const testVideos = [
        {
          user_id: '11111111-1111-1111-1111-111111111111',
          video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          video_filename: 'big-buck-bunny.mp4',
          caption: 'Удивительные горные пейзажи Норвегии #путешествия #норвегия',
          music: 'Эпичная музыка - Adventure',
          likes_count: 12500,
          views_count: 89000
        },
        {
          user_id: '22222222-2222-2222-2222-222222222222',
          video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
          video_filename: 'elephants-dream.mp4',
          caption: 'Приготовление идеального кофе дома ☕ #кофе #рецепт',
          music: 'тренд • morning vibe',
          likes_count: 8700,
          views_count: 45000
        },
        {
          user_id: '33333333-3333-3333-3333-333333333333',
          video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          video_filename: 'workout-video.mp4',
          caption: 'Тренировка на свежем воздухе 💪 #спорт #здоровье',
          music: 'тренд • workout motivation',
          likes_count: 15600,
          views_count: 120000
        },
        {
          user_id: '44444444-4444-4444-4444-444444444444',
          video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
          video_filename: 'digital-art.mp4',
          caption: 'Процесс создания цифрового арта ✨ #дизайн #арт',
          music: 'оригинальный звук',
          likes_count: 23100,
          views_count: 210000
        }
      ];
      
      for (const video of testVideos) {
        await pool.query(
          `INSERT INTO reels (user_id, video_url, video_filename, caption, music, likes_count, views_count, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days')`,
          [video.user_id, video.video_url, video.video_filename, video.caption, video.music, video.likes_count, video.views_count]
        );
      }
      
      console.log('✅ Тестовые Reels созданы');
    }
    
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error.message);
  }
}

// Инициализируем базу данных
initializeDatabase();

// ============= API МАРШРУТЫ =============

// 1. Аутентификация
app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone, name } = req.body;

    if (!phone || !name) {
      return res.status(400).json({ error: 'Телефон и имя обязательны' });
    }

    // Проверяем существование пользователя
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE phone = $1',
      [phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    // Создаем пользователя
    const result = await pool.query(
      'INSERT INTO users (phone, name) VALUES ($1, $2) RETURNING id, phone, name',
      [phone, name]
    );

    res.json({
      success: true,
      userId: result.rows[0].id,
      verificationCode: '1234',
      message: 'Код подтверждения отправлен'
    });

  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 2. Подтверждение кода
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { userId, code, userData } = req.body;

    if (code !== '1234') {
      return res.status(400).json({ error: 'Неверный код' });
    }

    // Обновляем данные пользователя
    if (userData) {
      const updates = [];
      const values = [];
      let index = 1;

      if (userData.surname) {
        updates.push(`surname = $${index++}`);
        values.push(userData.surname);
      }
      if (userData.bio) {
        updates.push(`bio = $${index++}`);
        values.push(userData.bio);
      }
      if (userData.gender) {
        updates.push(`gender = $${index++}`);
        values.push(userData.gender);
      }

      if (updates.length > 0) {
        values.push(userId);
        await pool.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${index}`,
          values
        );
      }
    }

    // Получаем обновленные данные
    const userResult = await pool.query(
      'SELECT id, phone, name, surname, bio, gender FROM users WHERE id = $1',
      [userId]
    );

    res.json({
      success: true,
      user: userResult.rows[0]
    });

  } catch (error) {
    console.error('Ошибка подтверждения:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 3. Получить профиль пользователя
app.get('/api/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    const result = await pool.query(
      'SELECT id, phone, name, surname, bio, gender, avatar_url FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({ success: true, user: result.rows[0] });

  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 4. Загрузка Reel
app.post('/api/reels/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Видео файл обязателен' });
    }

    const { userId, caption, music } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'ID пользователя обязателен' });
    }

    // Создаем публичный URL для видео
    const videoUrl = `/uploads/videos/${req.file.filename}`;
    
    // Сохраняем в базу данных
    const result = await pool.query(
      `INSERT INTO reels (user_id, video_url, video_filename, caption, music) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, videoUrl, req.file.filename, caption || '', music || '']
    );

    res.json({
      success: true,
      reel: result.rows[0],
      message: 'Reel успешно загружен'
    });

  } catch (error) {
    console.error('Ошибка загрузки видео:', error);
    res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
  }
});

// 5. Получить ленту Reels
app.get('/api/reels/feed', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT r.*, 
             u.name as user_name,
             u.avatar_url as user_avatar,
             (SELECT COUNT(*) FROM reel_likes WHERE reel_id = r.id) as likes_count,
             COALESCE((SELECT EXISTS(SELECT 1 FROM reel_likes WHERE reel_id = r.id AND user_id = $1)), false) as is_liked
      FROM reels r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.query.userId || '00000000-0000-0000-0000-000000000000', parseInt(limit), parseInt(offset)]);

    // Увеличиваем счетчик просмотров
    if (result.rows.length > 0) {
      const reelIds = result.rows.map(r => r.id);
      await pool.query(`
        UPDATE reels 
        SET views_count = views_count + 1 
        WHERE id = ANY($1::uuid[])
      `, [reelIds]);
    }

    // Получаем общее количество
    const totalResult = await pool.query('SELECT COUNT(*) FROM reels');
    
    res.json({ 
      success: true, 
      reels: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.rows[0].count)
      }
    });

  } catch (error) {
    console.error('Ошибка получения Reels:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 6. Лайк/дизлайк Reel
app.post('/api/reels/:id/like', async (req, res) => {
  try {
    const reelId = req.params.id;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'ID пользователя обязателен' });
    }

    // Проверяем, не лайкал ли уже
    const existing = await pool.query(
      'SELECT id FROM reel_likes WHERE reel_id = $1 AND user_id = $2',
      [reelId, userId]
    );

    if (existing.rows.length > 0) {
      // Удаляем лайк
      await pool.query('DELETE FROM reel_likes WHERE reel_id = $1 AND user_id = $2', [reelId, userId]);
    } else {
      // Добавляем лайк
      await pool.query('INSERT INTO reel_likes (reel_id, user_id) VALUES ($1, $2)', [reelId, userId]);
    }

    // Получаем обновленное количество лайков
    const likesResult = await pool.query(
      'SELECT COUNT(*) as likes_count FROM reel_likes WHERE reel_id = $1',
      [reelId]
    );

    res.json({ 
      success: true,
      likes_count: parseInt(likesResult.rows[0].likes_count),
      is_liked: existing.rows.length === 0
    });

  } catch (error) {
    console.error('Ошибка лайка:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 7. Создать тестовые Reels (если нужны)
app.post('/api/reels/create-test', async (req, res) => {
  try {
    const testVideos = [
      {
        user_id: '11111111-1111-1111-1111-111111111111',
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        video_filename: 'big-buck-bunny.mp4',
        caption: 'Удивительные горные пейзажи Норвегии #путешествия #норвегия',
        music: 'Эпичная музыка - Adventure',
        likes_count: 12500,
        views_count: 89000
      },
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        video_filename: 'elephants-dream.mp4',
        caption: 'Приготовление идеального кофе дома ☕ #кофе #рецепт',
        music: 'тренд • morning vibe',
        likes_count: 8700,
        views_count: 45000
      },
      {
        user_id: '33333333-3333-3333-3333-333333333333',
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        video_filename: 'workout-video.mp4',
        caption: 'Тренировка на свежем воздухе 💪 #спорт #здоровье',
        music: 'тренд • workout motivation',
        likes_count: 15600,
        views_count: 120000
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        video_filename: 'digital-art.mp4',
        caption: 'Процесс создания цифрового арта ✨ #дизайн #арт',
        music: 'оригинальный звук',
        likes_count: 23100,
        views_count: 210000
      }
    ];

    const inserted = [];
    
    for (const video of testVideos) {
      const result = await pool.query(
        `INSERT INTO reels (user_id, video_url, video_filename, caption, music, likes_count, views_count, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days') RETURNING id`,
        [video.user_id, video.video_url, video.video_filename, video.caption, video.music, video.likes_count, video.views_count]
      );
      inserted.push(result.rows[0]);
    }

    res.json({ 
      success: true, 
      message: `Добавлено ${inserted.length} тестовых видео`,
      reels: inserted 
    });

  } catch (error) {
    console.error('Ошибка создания тестовых данных:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 8. Получить Reel по ID
app.get('/api/reels/:id', async (req, res) => {
  try {
    const reelId = req.params.id;

    const result = await pool.query(`
      SELECT r.*, 
             u.name as user_name,
             u.avatar_url as user_avatar,
             (SELECT COUNT(*) FROM reel_likes WHERE reel_id = r.id) as likes_count
      FROM reels r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.id = $1
    `, [reelId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reel не найден' });
    }

    // Увеличиваем счетчик просмотров
    await pool.query('UPDATE reels SET views_count = views_count + 1 WHERE id = $1', [reelId]);

    res.json({ success: true, reel: result.rows[0] });

  } catch (error) {
    console.error('Ошибка получения Reel:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 9. Друзья - поиск
app.get('/api/friends/search', async (req, res) => {
  try {
    const { query } = req.query;

    const result = await pool.query(
      `SELECT id, name, surname, avatar_url, bio 
       FROM users 
       WHERE name ILIKE $1 OR surname ILIKE $1
       LIMIT 20`,
      [`%${query}%`]
    );

    res.json({ success: true, users: result.rows });

  } catch (error) {
    console.error('Ошибка поиска друзей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 10. Друзья - отправить запрос
app.post('/api/friends/request', async (req, res) => {
  try {
    const { userId, friendId } = req.body;

    await pool.query(
      'INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, $3)',
      [userId, friendId, 'pending']
    );

    res.json({ success: true, message: 'Запрос отправлен' });

  } catch (error) {
    console.error('Ошибка отправки запроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 11. Сообщества - создать
app.post('/api/communities', async (req, res) => {
  try {
    const { name, type, description, isPrivate, createdBy } = req.body;

    const result = await pool.query(
      `INSERT INTO communities (name, type, description, is_private, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, type, description, isPrivate || false, createdBy]
    );

    const community = result.rows[0];

    // Создатель становится админом
    await pool.query(
      'INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, $3)',
      [community.id, createdBy, 'admin']
    );

    res.json({ success: true, community });

  } catch (error) {
    console.error('Ошибка создания сообщества:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 12. Сообщества - поиск
app.get('/api/communities/search', async (req, res) => {
  try {
    const { query, type } = req.query;

    let sql = `
      SELECT c.*, COUNT(cm.user_id) as members_count
      FROM communities c
      LEFT JOIN community_members cm ON c.id = cm.community_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (query) {
      sql += ` AND (c.name ILIKE $${paramCount} OR c.description ILIKE $${paramCount})`;
      params.push(`%${query}%`);
      paramCount++;
    }

    if (type && type !== 'all') {
      sql += ` AND c.type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }

    sql += ` GROUP BY c.id ORDER BY members_count DESC LIMIT 20`;

    const result = await pool.query(sql, params);
    res.json({ success: true, communities: result.rows });

  } catch (error) {
    console.error('Ошибка поиска сообществ:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 13. VASTAPAE - лента
app.get('/api/feed/vastapae', async (req, res) => {
  try {
    const posts = await pool.query(`
      SELECT p.*, u.name, u.surname, u.avatar_url, c.name as community_name
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      ORDER BY p.created_at DESC
      LIMIT 20
    `);

    res.json({ success: true, posts: posts.rows });

  } catch (error) {
    console.error('Ошибка получения ленты:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 14. VASTAPAE - создать пост
app.post('/api/feed/posts', async (req, res) => {
  try {
    const { userId, content, communityId } = req.body;

    const result = await pool.query(
      'INSERT INTO posts (user_id, content, community_id) VALUES ($1, $2, $3) RETURNING *',
      [userId, content, communityId]
    );

    res.json({ success: true, post: result.rows[0] });

  } catch (error) {
    console.error('Ошибка создания поста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 15. Сообщения сообщества
app.get('/api/communities/:id/messages', async (req, res) => {
  try {
    const communityId = req.params.id;

    const messages = await pool.query(`
      SELECT cm.*, u.name, u.surname, u.avatar_url
      FROM community_messages cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.community_id = $1
      ORDER BY cm.created_at ASC
      LIMIT 50
    `, [communityId]);

    res.json({ success: true, messages: messages.rows });

  } catch (error) {
    console.error('Ошибка получения сообщений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 16. Отправить сообщение в сообщество
app.post('/api/communities/:id/messages', async (req, res) => {
  try {
    const communityId = req.params.id;
    const { userId, content } = req.body;

    const result = await pool.query(
      'INSERT INTO community_messages (community_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
      [communityId, userId, content]
    );

    res.json({ success: true, message: result.rows[0] });

  } catch (error) {
    console.error('Ошибка отправки сообщения:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 17. Личные сообщения - отправить
app.post('/api/messages/send', async (req, res) => {
  try {
    const { senderId, receiverId, content, isAnonymous, anonymousAvatar, anonymousName } = req.body;

    const result = await pool.query(
      `INSERT INTO private_messages 
       (sender_id, receiver_id, content, is_anonymous, anonymous_avatar, anonymous_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [senderId, receiverId, content, isAnonymous || false, anonymousAvatar, anonymousName]
    );

    res.json({ success: true, message: result.rows[0] });

  } catch (error) {
    console.error('Ошибка отправки сообщения:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 18. LOVE чаты - создать
app.post('/api/love/create', async (req, res) => {
  try {
    const { user1Id, user2Id } = req.body;

    const result = await pool.query(
      'INSERT INTO love_chats (user1_id, user2_id) VALUES ($1, $2) RETURNING *',
      [user1Id, user2Id]
    );

    res.json({ success: true, chat: result.rows[0] });

  } catch (error) {
    console.error('Ошибка создания LOVE чата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 19. Маршрут для проверки здоровья
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'Connected',
    reels_count: 4,
    users_count: 4
  });
});

// 20. Получить все данные для отладки
app.get('/api/debug', async (req, res) => {
  try {
    const users = await pool.query('SELECT id, name, phone FROM users LIMIT 10');
    const reels = await pool.query('SELECT id, user_id, caption, video_url FROM reels LIMIT 10');
    const likes = await pool.query('SELECT reel_id, COUNT(*) as likes FROM reel_likes GROUP BY reel_id LIMIT 10');
    
    res.json({
      success: true,
      users: users.rows,
      reels: reels.rows,
      likes: likes.rows,
      uploads_dir: uploadsDir,
      files: fs.readdirSync(uploadsDir)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= СТАТИЧЕСКИЕ ФАЙЛЫ И РОУТИНГ =============

// Специальные маршруты для HTML страниц
app.get('/reels-feed', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reels-feed.html'));
});

app.get('/upload-video', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload-video.html'));
});

app.get('/vastapae-feed', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vastapae-feed.html'));
});

app.get('/main-hub', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main-hub.html'));
});

// Все остальные запросы → проверяем существование файла или отдаем launch.html
app.get('*', (req, res) => {
  // Если запрос начинается с /api/, возвращаем 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found: ' + req.path });
  }
  
  // Если запрос на загруженное видео
  if (req.path.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, 'public', req.path);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    } else {
      return res.status(404).json({ error: 'File not found' });
    }
  }
  
  // Проверяем, существует ли запрашиваемый файл
  const filePath = path.join(__dirname, 'public', req.path);
  if (req.path !== '/' && fs.existsSync(filePath) && !filePath.includes('.')) {
    const ext = path.extname(filePath);
    if (!ext || ext === '.html') {
      // Если это HTML файл без расширения или с .html
      const htmlFile = ext === '.html' ? filePath : filePath + '.html';
      if (fs.existsSync(htmlFile)) {
        return res.sendFile(htmlFile);
      }
    } else {
      // Если файл с расширением существует
      return res.sendFile(filePath);
    }
  }
  
  // Для корневого пути проверяем launch.html
  if (req.path === '/') {
    const launchPath = path.join(__dirname, 'public', 'launch.html');
    if (fs.existsSync(launchPath)) {
      return res.sendFile(launchPath);
    }
  }
  
  // Если ничего не найдено, отдаем простую страницу
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Coolpep Server</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        .container { max-width: 800px; margin: 0 auto; background: rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; }
        h1 { margin-bottom: 30px; }
        .endpoint { background: rgba(255,255,255,0.2); padding: 15px; margin: 10px 0; border-radius: 10px; text-align: left; }
        a { color: white; text-decoration: none; font-weight: bold; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 Coolpep Server запущен!</h1>
        <p>Сервер работает на порту ${PORT}</p>
        
        <div class="endpoint">
          <strong>📹 Reels:</strong><br>
          <a href="/reels-feed.html" target="_blank">/reels-feed.html</a> - Лента видео<br>
          <a href="/upload-video.html" target="_blank">/upload-video.html</a> - Загрузить видео<br>
          <a href="/api/reels/feed" target="_blank">/api/reels/feed</a> - API ленты Reels
        </div>
        
        <div class="endpoint">
          <strong>🔧 Инструменты:</strong><br>
          <a href="/api/health" target="_blank">/api/health</a> - Проверка сервера<br>
          <a href="/api/debug" target="_blank">/api/debug</a> - Отладка данных<br>
          <a href="/api/reels/create-test" target="_blank">/api/reels/create-test</a> - Создать тестовые данные (POST)
        </div>
        
        <div class="endpoint">
          <strong>👤 Пользователи (тестовые):</strong><br>
          ID: 11111111-1111-1111-1111-111111111111 - Иван Иванов<br>
          ID: 22222222-2222-2222-2222-222222222222 - Анна Петрова<br>
          ID: 33333333-3333-3333-3333-333333333333 - Дмитрий Сидоров<br>
          ID: 44444444-4444-4444-4444-444444444444 - Мария Козлова
        </div>
        
        <p style="margin-top: 30px;">📁 Загруженные видео: ${fs.readdirSync(uploadsDir).length} файлов</p>
      </div>
    </body>
    </html>
  `);
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📡 API доступен по адресу: http://localhost:${PORT}/api/`);
  console.log(`🌐 Frontend доступен по адресу: http://localhost:${PORT}/`);
  console.log(`📹 Reels: http://localhost:${PORT}/reels-feed.html`);
  console.log(`⬆️ Upload: http://localhost:${PORT}/upload-video.html`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔧 Debug: http://localhost:${PORT}/api/debug`);
});
