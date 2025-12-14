const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Инициализация приложения
const app = express();

// Конфигурация
const PORT = process.env.PORT || 3000;

// Подключение к PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Увеличиваем лимит для Base64
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Проверка подключения к базе данных
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Ошибка подключения к базе данных:', err);
  } else {
    console.log('✅ Успешное подключение к базе данных Neon');
    release();
    
    // Создаем таблицы при запуске
    initializeTables();
  }
});

// Функция для создания таблиц
async function initializeTables() {
  try {
    const tablesSQL = `
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
      
      -- Таблица Reels с Base64 видео
      CREATE TABLE IF NOT EXISTS reels (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          video_base64 TEXT NOT NULL,
          video_filename VARCHAR(255) NOT NULL,
          file_size INTEGER NOT NULL,
          mime_type VARCHAR(50) NOT NULL,
          thumbnail_url VARCHAR(500),
          caption TEXT,
          music VARCHAR(255),
          likes_count INTEGER DEFAULT 0,
          views_count INTEGER DEFAULT 0,
          duration INTEGER,
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
      
      -- Индексы для производительности
      CREATE INDEX IF NOT EXISTS idx_reels_user_id ON reels(user_id);
      CREATE INDEX IF NOT EXISTS idx_reels_created_at ON reels(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reel_likes_reel_id ON reel_likes(reel_id);
      CREATE INDEX IF NOT EXISTS idx_reel_likes_user_id ON reel_likes(user_id);
    `;
    
    await pool.query(tablesSQL);
    console.log('✅ Таблицы созданы/проверены');
    
    // Создаем тестовые данные если их нет
    await createTestData();
    
  } catch (error) {
    console.error('❌ Ошибка создания таблиц:', error.message);
  }
}

// Создание тестовых данных
async function createTestData() {
  try {
    // Проверяем наличие пользователей
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(usersCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO users (id, phone, name, surname, bio, gender, avatar_url) 
        VALUES 
          ('11111111-1111-1111-1111-111111111111', '+79991234567', 'Иван', 'Иванов', 'Люблю путешествия и спорт', 'male', '👨'),
          ('22222222-2222-2222-2222-222222222222', '+79997654321', 'Анна', 'Петрова', 'Кофеман и дизайнер', 'female', '👩'),
          ('33333333-3333-3333-3333-333333333333', '+79995556677', 'Дмитрий', 'Сидоров', 'Фитнес тренер', 'male', '💪'),
          ('44444444-4444-4444-4444-444444444444', '+79998889900', 'Мария', 'Козлова', 'Художник и иллюстратор', 'female', '🎨'),
          ('55555555-5555-5555-5555-555555555555', '+79991112233', 'Алексей', 'Новиков', 'Фотограф и путешественник', 'male', '📸'),
          ('66666666-6666-6666-6666-666666666666', '+79994445566', 'Екатерина', 'Волкова', 'Блогер и предприниматель', 'female', '💼')
        ON CONFLICT (phone) DO NOTHING
      `);
      console.log('✅ 6 тестовых пользователей созданы');
    }
    
    // Проверяем наличие Reels
    const reelsCount = await pool.query('SELECT COUNT(*) FROM reels');
    if (parseInt(reelsCount.rows[0].count) === 0) {
      // Создаем демо-видео с короткими Base64 (заглушки)
      const demoVideos = [
        {
          user_id: '11111111-1111-1111-1111-111111111111',
          video_base64: 'data:video/mp4;base64,vGhpcyBpcyBhIGRlbW8gdmlkZW8=',
          video_filename: 'mountain-scenery.mp4',
          file_size: 5242880,
          mime_type: 'video/mp4',
          caption: 'Удивительные горные пейзажи Норвегии 🌄 #путешествия #норвегия #природа',
          music: 'Эпичная музыка - Adventure',
          likes_count: 12500,
          views_count: 89000,
          duration: 15
        },
        {
          user_id: '22222222-2222-2222-2222-222222222222',
          video_base64: 'data:video/mp4;base64,ZGVtbyB2aWRlbyBjb250ZW50',
          video_filename: 'coffee-making.mp4',
          file_size: 3145728,
          mime_type: 'video/mp4',
          caption: 'Приготовление идеального кофе дома ☕ #кофе #рецепт #утро',
          music: 'тренд • morning vibe',
          likes_count: 8700,
          views_count: 45000,
          duration: 12
        },
        {
          user_id: '33333333-3333-3333-3333-333333333333',
          video_base64: 'data:video/mp4;base64,ZGVtbyB3b3Jrb3V0IHZpZGVv',
          video_filename: 'outdoor-workout.mp4',
          file_size: 7340032,
          mime_type: 'video/mp4',
          caption: 'Тренировка на свежем воздухе 💪 #спорт #здоровье #фитнес',
          music: 'тренд • workout motivation',
          likes_count: 15600,
          views_count: 120000,
          duration: 18
        },
        {
          user_id: '44444444-4444-4444-4444-444444444444',
          video_base64: 'data:video/mp4;base64,YXJ0IGNyZWF0aW9uIGRlbW8=',
          video_filename: 'digital-art.mp4',
          file_size: 6291456,
          mime_type: 'video/mp4',
          caption: 'Процесс создания цифрового арта ✨ #дизайн #арт #креатив',
          music: 'оригинальный звук',
          likes_count: 23100,
          views_count: 210000,
          duration: 20
        },
        {
          user_id: '55555555-5555-5555-5555-555555555555',
          video_base64: 'data:video/mp4;base64,cGhvdG9ncmFwaHkgZGVtbyB2aWRlbw==',
          video_filename: 'photography-tips.mp4',
          file_size: 4194304,
          mime_type: 'video/mp4',
          caption: 'Советы по фотографии для начинающих 📸 #фотография #советы #обучение',
          music: 'тренд • creative vibes',
          likes_count: 9800,
          views_count: 56000,
          duration: 14
        },
        {
          user_id: '66666666-6666-6666-6666-666666666666',
          video_base64: 'data:video/mp4;base64,YnVzaW5lc3MgdGlwcyBkZW1v',
          video_filename: 'business-ideas.mp4',
          file_size: 5242880,
          mime_type: 'video/mp4',
          caption: 'Бизнес-идеи 2024 года 💼 #бизнес #стартап #идеи',
          music: 'тренд • productive day',
          likes_count: 13400,
          views_count: 78000,
          duration: 16
        }
      ];
      
      for (const video of demoVideos) {
        await pool.query(`
          INSERT INTO reels (user_id, video_base64, video_filename, file_size, mime_type, caption, music, likes_count, views_count, duration, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days')
          ON CONFLICT DO NOTHING
        `, [
          video.user_id, video.video_base64, video.video_filename, video.file_size, 
          video.mime_type, video.caption, video.music, video.likes_count, 
          video.views_count, video.duration
        ]);
      }
      
      console.log('✅ 6 демо Reels созданы');
      
      // Создаем несколько лайков
      await pool.query(`
        INSERT INTO reel_likes (reel_id, user_id)
        SELECT r.id, u.id
        FROM reels r
        CROSS JOIN users u
        WHERE random() < 0.3
        ON CONFLICT DO NOTHING
      `);
      console.log('✅ Демо лайки созданы');
    }
    
  } catch (error) {
    console.error('❌ Ошибка создания тестовых данных:', error.message);
  }
}

// ============= API МАРШРУТЫ =============

// 1. Главная страница - main-hub.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main-hub.html'));
});

// 2. Загрузка видео Reel (Base64)
app.post('/api/reels/upload', async (req, res) => {
  try {
    const { userId, videoBase64, filename, fileSize, mimeType, caption, music, duration } = req.body;
    
    if (!userId || !videoBase64) {
      return res.status(400).json({ error: 'ID пользователя и видео обязательны' });
    }
    
    // Проверка размера файла (максимум 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (fileSize > maxSize) {
      return res.status(400).json({ error: 'Размер файла не должен превышать 10MB' });
    }
    
    // Проверка формата Base64
    if (!videoBase64.startsWith('data:video/')) {
      return res.status(400).json({ error: 'Неверный формат видео' });
    }
    
    // Проверяем существование пользователя
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Сохраняем в базу данных
    const result = await pool.query(`
      INSERT INTO reels (user_id, video_base64, video_filename, file_size, mime_type, caption, music, duration)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, caption, music, likes_count, views_count, duration, created_at
    `, [userId, videoBase64, filename || 'video.mp4', fileSize || 0, mimeType || 'video/mp4', 
        caption || '', music || '', duration || 15]);
    
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

// 3. Получить ленту Reels
app.get('/api/reels/feed', async (req, res) => {
  try {
    const { page = 1, limit = 20, userId } = req.query;
    const offset = (page - 1) * limit;
    
    // Получаем Reels с информацией о пользователе
    const result = await pool.query(`
      SELECT r.id, r.user_id, r.video_filename, r.file_size, r.mime_type, r.caption, r.music, 
             r.likes_count, r.views_count, r.duration, r.created_at,
             u.name as user_name, u.surname as user_surname, u.avatar_url as user_avatar, u.bio as user_bio,
             CASE WHEN rl.user_id IS NOT NULL THEN true ELSE false END as is_liked,
             (SELECT COUNT(*) FROM reel_likes WHERE reel_id = r.id) as actual_likes
      FROM reels r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN reel_likes rl ON r.id = rl.reel_id AND rl.user_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId || null, parseInt(limit), parseInt(offset)]);
    
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

// 4. Получить конкретное видео (Base64)
app.get('/api/reels/:id/video', async (req, res) => {
  try {
    const reelId = req.params.id;
    
    const result = await pool.query(`
      SELECT video_base64, mime_type, video_filename 
      FROM reels 
      WHERE id = $1
    `, [reelId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reel не найден' });
    }
    
    // Увеличиваем счетчик просмотров
    await pool.query('UPDATE reels SET views_count = views_count + 1 WHERE id = $1', [reelId]);
    
    const video = result.rows[0];
    
    // Отправляем видео как Base64
    res.json({
      success: true,
      video: video.video_base64,
      mimeType: video.mime_type,
      filename: video.video_filename
    });
    
  } catch (error) {
    console.error('Ошибка получения видео:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 5. Получить информацию о Reel
app.get('/api/reels/:id', async (req, res) => {
  try {
    const reelId = req.params.id;
    const { userId } = req.query;
    
    const result = await pool.query(`
      SELECT r.*, 
             u.name as user_name, u.surname as user_surname, u.avatar_url as user_avatar, u.bio as user_bio,
             CASE WHEN rl.user_id IS NOT NULL THEN true ELSE false END as is_liked
      FROM reels r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN reel_likes rl ON r.id = rl.reel_id AND rl.user_id = $2
      WHERE r.id = $1
    `, [reelId, userId || null]);
    
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

// 6. Лайк/дизлайк Reel
app.post('/api/reels/:id/like', async (req, res) => {
  try {
    const reelId = req.params.id;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'ID пользователя обязателен' });
    }
    
    // Проверяем существование Reel
    const reelCheck = await pool.query('SELECT id FROM reels WHERE id = $1', [reelId]);
    if (reelCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Reel не найден' });
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
    
    // Обновляем счетчик в таблице reels
    await pool.query('UPDATE reels SET likes_count = $1 WHERE id = $2', 
      [parseInt(likesResult.rows[0].likes_count), reelId]);
    
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

// 7. Аутентификация
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
      'INSERT INTO users (phone, name) VALUES ($1, $2) RETURNING id, phone, name, avatar_url',
      [phone, name]
    );
    
    res.json({
      success: true,
      userId: result.rows[0].id,
      user: result.rows[0],
      verificationCode: '1234',
      message: 'Код подтверждения отправлен'
    });
    
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 8. Подтверждение кода
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
      'SELECT id, phone, name, surname, bio, gender, avatar_url FROM users WHERE id = $1',
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

// 9. Создать тестовые Reels
app.post('/api/reels/create-test', async (req, res) => {
  try {
    // Проверяем наличие пользователей
    const users = await pool.query('SELECT id FROM users LIMIT 3');
    if (users.rows.length === 0) {
      return res.status(400).json({ error: 'Нет пользователей для создания тестовых Reels' });
    }
    
    const testVideos = [
      {
        video_base64: 'data:video/mp4;base64,dGVzdCB2aWRlbyBjb250ZW50',
        video_filename: 'test-mountain.mp4',
        file_size: 5242880,
        mime_type: 'video/mp4',
        caption: 'Тестовое видео: горные пейзажи 🏔️ #тест #демо',
        music: 'Эпичная музыка - Adventure',
        likes_count: 100,
        views_count: 500,
        duration: 10
      },
      {
        video_base64: 'data:video/mp4;base64,dGVzdCB2aWRlbyBkZW1v',
        video_filename: 'test-coffee.mp4',
        file_size: 3145728,
        mime_type: 'video/mp4',
        caption: 'Тестовое видео: приготовление кофе ☕ #тест #кофе',
        music: 'тренд • morning vibe',
        likes_count: 85,
        views_count: 300,
        duration: 8
      }
    ];
    
    const inserted = [];
    
    for (let i = 0; i < testVideos.length; i++) {
      const video = testVideos[i];
      const user = users.rows[i % users.rows.length];
      
      const result = await pool.query(`
        INSERT INTO reels (user_id, video_base64, video_filename, file_size, mime_type, caption, music, likes_count, views_count, duration, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        RETURNING id, caption, created_at
      `, [
        user.id, video.video_base64, video.video_filename, video.file_size,
        video.mime_type, video.caption, video.music, video.likes_count,
        video.views_count, video.duration
      ]);
      inserted.push(result.rows[0]);
    }
    
    res.json({ 
      success: true, 
      message: `Добавлено ${inserted.length} тестовых видео`,
      reels: inserted 
    });
    
  } catch (error) {
    console.error('Ошибка создания тестовых данных:', error);
    res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
  }
});

// 10. Проверка здоровья
app.get('/api/health', async (req, res) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const reelsCount = await pool.query('SELECT COUNT(*) FROM reels');
    const likesCount = await pool.query('SELECT COUNT(*) FROM reel_likes');
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'Connected',
      users_count: parseInt(usersCount.rows[0].count),
      reels_count: parseInt(reelsCount.rows[0].count),
      likes_count: parseInt(likesCount.rows[0].count),
      server: 'Coolpep Social Platform',
      version: '1.0.0'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: 'Database connection failed',
      message: error.message 
    });
  }
});

// 11. Получить статистику
app.get('/api/stats', async (req, res) => {
  try {
    const totalReels = await pool.query('SELECT COUNT(*) FROM reels');
    const totalLikes = await pool.query('SELECT SUM(likes_count) FROM reels');
    const totalViews = await pool.query('SELECT SUM(views_count) FROM reels');
    const recentReels = await pool.query('SELECT COUNT(*) FROM reels WHERE created_at > NOW() - INTERVAL \'7 days\'');
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    
    // Самые популярные Reels
    const popularReels = await pool.query(`
      SELECT r.id, r.caption, r.likes_count, r.views_count, u.name as user_name
      FROM reels r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.likes_count DESC
      LIMIT 5
    `);
    
    res.json({
      success: true,
      stats: {
        total_reels: parseInt(totalReels.rows[0].count),
        total_likes: parseInt(totalLikes.rows[0].sum || 0),
        total_views: parseInt(totalViews.rows[0].sum || 0),
        recent_reels: parseInt(recentReels.rows[0].count),
        total_users: parseInt(totalUsers.rows[0].count)
      },
      popular_reels: popularReels.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// 12. Поиск Reels
app.get('/api/reels/search', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Поисковый запрос должен содержать минимум 2 символа' });
    }
    
    const result = await pool.query(`
      SELECT r.id, r.user_id, r.caption, r.music, r.likes_count, r.views_count, r.created_at,
             u.name as user_name, u.surname as user_surname, u.avatar_url as user_avatar
      FROM reels r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.caption ILIKE $1 OR u.name ILIKE $1 OR u.surname ILIKE $1
      ORDER BY r.created_at DESC
      LIMIT 20
    `, [`%${query}%`]);
    
    res.json({ success: true, reels: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// 13. Получить всех пользователей
app.get('/api/users', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const result = await pool.query(`
      SELECT id, name, surname, avatar_url, bio
      FROM users
      ORDER BY created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);
    
    res.json({ success: true, users: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

// 14. Получить пользователя по ID
app.get('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    const result = await pool.query(`
      SELECT id, name, surname, avatar_url, bio, gender, created_at
      FROM users
      WHERE id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Получаем количество Reels пользователя
    const reelsCount = await pool.query('SELECT COUNT(*) FROM reels WHERE user_id = $1', [userId]);
    
    // Получаем количество лайков пользователя
    const totalLikes = await pool.query(`
      SELECT SUM(r.likes_count) as total_likes
      FROM reels r
      WHERE r.user_id = $1
    `, [userId]);
    
    const user = result.rows[0];
    user.stats = {
      reels_count: parseInt(reelsCount.rows[0].count),
      total_likes: parseInt(totalLikes.rows[0].total_likes || 0)
    };
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения пользователя' });
  }
});

// 15. Получить Reels пользователя
app.get('/api/users/:id/reels', async (req, res) => {
  try {
    const userId = req.params.id;
    const { limit = 20 } = req.query;
    
    // Проверяем существование пользователя
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    const result = await pool.query(`
      SELECT r.*, 
             u.name as user_name, u.surname as user_surname, u.avatar_url as user_avatar
      FROM reels r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2
    `, [userId, parseInt(limit)]);
    
    res.json({ success: true, reels: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения Reels пользователя' });
  }
});

// 16. Обновить аватар пользователя
app.post('/api/users/:id/avatar', async (req, res) => {
  try {
    const userId = req.params.id;
    const { avatarUrl } = req.body;
    
    if (!avatarUrl) {
      return res.status(400).json({ error: 'URL аватара обязателен' });
    }
    
    await pool.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2',
      [avatarUrl, userId]
    );
    
    res.json({ success: true, avatarUrl });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка обновления аватара' });
  }
});

// 17. VASTAPAE - лента
app.get('/api/feed/vastapae', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const posts = await pool.query(`
      SELECT p.*, u.name, u.surname, u.avatar_url, c.name as community_name
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      ORDER BY p.created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);
    
    res.json({ success: true, posts: posts.rows });
  } catch (error) {
    console.error('Ошибка получения ленты:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 18. VASTAPAE - создать пост
app.post('/api/feed/posts', async (req, res) => {
  try {
    const { userId, content, communityId } = req.body;
    
    if (!userId || !content) {
      return res.status(400).json({ error: 'ID пользователя и содержание обязательны' });
    }
    
    const result = await pool.query(
      'INSERT INTO posts (user_id, content, community_id) VALUES ($1, $2, $3) RETURNING *',
      [userId, content, communityId || null]
    );
    
    res.json({ success: true, post: result.rows[0] });
  } catch (error) {
    console.error('Ошибка создания поста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 19. Сообщества - поиск
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
    res.status(500).json({ error: 'Ошибка поиска сообществ' });
  }
});

// 20. Друзья - поиск
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
    res.status(500).json({ error: 'Ошибка поиска друзей' });
  }
});

// ============= СТАТИЧЕСКИЕ ФАЙЛЫ =============

// Роуты для основных HTML страниц
const staticPages = [
  'main-hub',
  'reels-feed',
  'upload-video',
  'vastapae-feed',
  'friends-list',
  'family-main',
  'chat-personal',
  'chat-anonymous',
  'community-chat',
  'community-admin',
  'user-muted',
  'love-chat',
  'launch',
  'auth-phone',
  'auth-code',
  'profile-setup'
];

// Создаем маршруты для всех HTML страниц
staticPages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
  
  app.get(`/${page}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

// Обработка 404 для API
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API endpoint not found', 
    path: req.originalUrl,
    method: req.method 
  });
});

// Все остальные GET запросы → пробуем найти HTML файл
app.get('*', (req, res) => {
  // Пропускаем API запросы
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  
  // Пропускаем запросы к статическим файлам с расширениями
  if (req.path.includes('.')) {
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', req.path);
    
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    } else {
      return res.status(404).send('File not found');
    }
  }
  
  // Для всех остальных запросов пробуем найти HTML файл
  const fs = require('fs');
  const possiblePaths = [
    path.join(__dirname, 'public', req.path + '.html'),
    path.join(__dirname, 'public', req.path, 'index.html'),
    path.join(__dirname, 'public', 'main-hub.html')
  ];
  
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  
  // Если ничего не найдено, показываем главную страницу
  res.sendFile(path.join(__dirname, 'public', 'main-hub.html'));
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`
  🚀 Coolpep Social Platform запущен!
  ====================================
  📍 Порт: ${PORT}
  🌐 Главная: http://localhost:${PORT}/
  📹 Reels: http://localhost:${PORT}/reels-feed
  ⬆️ Загрузка: http://localhost:${PORT}/upload-video
  📱 VASTAPAE: http://localhost:${PORT}/vastapae-feed
  
  🔧 API Endpoints:
  • http://localhost:${PORT}/api/health - Проверка сервера
  • http://localhost:${PORT}/api/reels/feed - Лента Reels
  • http://localhost:${PORT}/api/stats - Статистика
  • http://localhost:${PORT}/api/users - Пользователи
  
  👤 Тестовые пользователи:
  • 11111111-1111-1111-1111-111111111111 - Иван Иванов
  • 22222222-2222-2222-2222-222222222222 - Анна Петрова
  • 33333333-3333-3333-3333-333333333333 - Дмитрий Сидоров
  
  📊 База данных: Neon PostgreSQL
  ====================================
  `);
});
