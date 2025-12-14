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
    console.error('Ошибка подключения к базе данных:', err);
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
    `;
    
    await pool.query(tablesSQL);
    console.log('✅ Таблицы созданы/проверены');
    
    // Создаем тестовые данные если их нет
    await createTestData();
    
  } catch (error) {
    console.error('❌ Ошибка создания таблиц:', error);
  }
}

// Создание тестовых данных
async function createTestData() {
  try {
    // Проверяем наличие пользователей
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(usersCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO users (id, phone, name, surname, bio, gender) 
        VALUES 
          ('11111111-1111-1111-1111-111111111111', '+79991234567', 'Иван', 'Иванов', 'Люблю путешествия и спорт', 'male'),
          ('22222222-2222-2222-2222-222222222222', '+79997654321', 'Анна', 'Петрова', 'Кофеман и дизайнер', 'female'),
          ('33333333-3333-3333-3333-333333333333', '+79995556677', 'Дмитрий', 'Сидоров', 'Фитнес тренер', 'male'),
          ('44444444-4444-4444-4444-444444444444', '+79998889900', 'Мария', 'Козлова', 'Художник и иллюстратор', 'female')
      `);
      console.log('✅ Тестовые пользователи созданы');
    }
    
    // Проверяем наличие Reels
    const reelsCount = await pool.query('SELECT COUNT(*) FROM reels');
    if (parseInt(reelsCount.rows[0].count) === 0) {
      // Создаем несколько демо Reels с короткими Base64 видео (пустыми для демо)
      const demoVideos = [
        {
          user_id: '11111111-1111-1111-1111-111111111111',
          video_base64: 'data:video/mp4;base64,dummy-video-base64-1',
          video_filename: 'mountain-scenery.mp4',
          file_size: 5242880, // 5MB
          mime_type: 'video/mp4',
          caption: 'Удивительные горные пейзажи Норвегии #путешествия #норвегия',
          music: 'Эпичная музыка - Adventure',
          likes_count: 12500,
          views_count: 89000,
          duration: 15
        },
        {
          user_id: '22222222-2222-2222-2222-222222222222',
          video_base64: 'data:video/mp4;base64,dummy-video-base64-2',
          video_filename: 'coffee-making.mp4',
          file_size: 3145728, // 3MB
          mime_type: 'video/mp4',
          caption: 'Приготовление идеального кофе дома ☕ #кофе #рецепт',
          music: 'тренд • morning vibe',
          likes_count: 8700,
          views_count: 45000,
          duration: 12
        },
        {
          user_id: '33333333-3333-3333-3333-333333333333',
          video_base64: 'data:video/mp4;base64,dummy-video-base64-3',
          video_filename: 'outdoor-workout.mp4',
          file_size: 7340032, // 7MB
          mime_type: 'video/mp4',
          caption: 'Тренировка на свежем воздухе 💪 #спорт #здоровье',
          music: 'тренд • workout motivation',
          likes_count: 15600,
          views_count: 120000,
          duration: 18
        }
      ];
      
      for (const video of demoVideos) {
        await pool.query(`
          INSERT INTO reels (user_id, video_base64, video_filename, file_size, mime_type, caption, music, likes_count, views_count, duration, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days')
        `, [
          video.user_id, video.video_base64, video.video_filename, video.file_size, 
          video.mime_type, video.caption, video.music, video.likes_count, 
          video.views_count, video.duration
        ]);
      }
      
      console.log('✅ Тестовые Reels созданы');
    }
  } catch (error) {
    console.error('❌ Ошибка создания тестовых данных:', error);
  }
}

// ============= API МАРШРУТЫ =============

// 1. Загрузка видео Reel (Base64)
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
    
    // Сохраняем в базу данных
    const result = await pool.query(`
      INSERT INTO reels (user_id, video_base64, video_filename, file_size, mime_type, caption, music, duration)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, caption, music, likes_count, views_count, created_at
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

// 2. Получить ленту Reels
app.get('/api/reels/feed', async (req, res) => {
  try {
    const { page = 1, limit = 10, userId } = req.query;
    const offset = (page - 1) * limit;
    
    // Получаем Reels с информацией о пользователе
    const result = await pool.query(`
      SELECT r.id, r.user_id, r.video_filename, r.file_size, r.mime_type, r.caption, r.music, 
             r.likes_count, r.views_count, r.duration, r.created_at,
             u.name as user_name, u.avatar_url as user_avatar,
             CASE WHEN rl.user_id IS NOT NULL THEN true ELSE false END as is_liked
      FROM reels r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN reel_likes rl ON r.id = rl.reel_id AND rl.user_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId || null, parseInt(limit), parseInt(offset)]);
    
    // Увеличиваем счетчик просмотров
    if (result.rows.length > 0) {
      await pool.query(`
        UPDATE reels 
        SET views_count = views_count + 1 
        WHERE id = ANY($1::uuid[])
      `, [result.rows.map(r => r.id)]);
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

// 3. Получить конкретное видео (Base64)
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

// 4. Получить информацию о Reel
app.get('/api/reels/:id', async (req, res) => {
  try {
    const reelId = req.params.id;
    const { userId } = req.query;
    
    const result = await pool.query(`
      SELECT r.*, 
             u.name as user_name, u.avatar_url as user_avatar,
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

// 5. Лайк/дизлайк Reel
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
      await pool.query('UPDATE reels SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1', [reelId]);
    } else {
      // Добавляем лайк
      await pool.query('INSERT INTO reel_likes (reel_id, user_id) VALUES ($1, $2)', [reelId, userId]);
      await pool.query('UPDATE reels SET likes_count = likes_count + 1 WHERE id = $1', [reelId]);
    }
    
    // Получаем обновленное количество лайков
    const likesResult = await pool.query(
      'SELECT likes_count FROM reels WHERE id = $1',
      [reelId]
    );
    
    res.json({ 
      success: true,
      likes_count: likesResult.rows[0]?.likes_count || 0,
      is_liked: existing.rows.length === 0
    });
    
  } catch (error) {
    console.error('Ошибка лайка:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 6. Аутентификация
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

// 7. Создать тестовые Reels
app.post('/api/reels/create-test', async (req, res) => {
  try {
    const testVideos = [
      {
        user_id: '11111111-1111-1111-1111-111111111111',
        video_base64: 'data:video/mp4;base64,demo-base64-1',
        video_filename: 'demo-mountain.mp4',
        file_size: 5242880,
        mime_type: 'video/mp4',
        caption: 'Удивительные горные пейзажи Норвегии #путешествия #норвегия',
        music: 'Эпичная музыка - Adventure',
        likes_count: 12500,
        views_count: 89000,
        duration: 15
      },
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        video_base64: 'data:video/mp4;base64,demo-base64-2',
        video_filename: 'demo-coffee.mp4',
        file_size: 3145728,
        mime_type: 'video/mp4',
        caption: 'Приготовление идеального кофе дома ☕ #кофе #рецепт',
        music: 'тренд • morning vibe',
        likes_count: 8700,
        views_count: 45000,
        duration: 12
      }
    ];
    
    const inserted = [];
    
    for (const video of testVideos) {
      const result = await pool.query(`
        INSERT INTO reels (user_id, video_base64, video_filename, file_size, mime_type, caption, music, likes_count, views_count, duration)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        video.user_id, video.video_base64, video.video_filename, video.file_size,
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 8. Проверка здоровья
app.get('/api/health', async (req, res) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const reelsCount = await pool.query('SELECT COUNT(*) FROM reels');
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'Connected',
      users_count: parseInt(usersCount.rows[0].count),
      reels_count: parseInt(reelsCount.rows[0].count)
    });
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// 9. Получить статистику
app.get('/api/stats', async (req, res) => {
  try {
    const totalReels = await pool.query('SELECT COUNT(*) FROM reels');
    const totalLikes = await pool.query('SELECT SUM(likes_count) FROM reels');
    const totalViews = await pool.query('SELECT SUM(views_count) FROM reels');
    const recentReels = await pool.query('SELECT COUNT(*) FROM reels WHERE created_at > NOW() - INTERVAL \'7 days\'');
    
    res.json({
      success: true,
      stats: {
        total_reels: parseInt(totalReels.rows[0].count),
        total_likes: parseInt(totalLikes.rows[0].sum || 0),
        total_views: parseInt(totalViews.rows[0].sum || 0),
        recent_reels: parseInt(recentReels.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// 10. Поиск Reels
app.get('/api/reels/search', async (req, res) => {
  try {
    const { query } = req.query;
    
    const result = await pool.query(`
      SELECT r.id, r.user_id, r.caption, r.music, r.likes_count, r.views_count, r.created_at,
             u.name as user_name, u.avatar_url as user_avatar
      FROM reels r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.caption ILIKE $1 OR u.name ILIKE $1
      ORDER BY r.created_at DESC
      LIMIT 20
    `, [`%${query}%`]);
    
    res.json({ success: true, reels: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// ============= СТАТИЧЕСКИЕ ФАЙЛЫ =============

// Роуты для HTML страниц
app.get('/reels-feed', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reels-feed.html'));
});

app.get('/upload-video', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload-video.html'));
});

// Главная страница
app.get('/', (req, res) => {
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
        .btn { display: inline-block; background: white; color: #667eea; padding: 12px 24px; border-radius: 8px; margin: 10px; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 Coolpep Server запущен!</h1>
        <p>Сервер работает на порту ${PORT}</p>
        
        <a href="/reels-feed.html" class="btn">📹 Смотреть Reels</a>
        <a href="/upload-video.html" class="btn">⬆️ Загрузить видео</a>
        
        <div class="endpoint">
          <strong>📹 Reels API:</strong><br>
          <a href="/api/reels/feed" target="_blank">GET /api/reels/feed</a> - Лента видео<br>
          <a href="/api/reels/upload" target="_blank">POST /api/reels/upload</a> - Загрузить видео<br>
          <a href="/api/reels/create-test" target="_blank">POST /api/reels/create-test</a> - Тестовые данные
        </div>
        
        <div class="endpoint">
          <strong>🔧 Инструменты:</strong><br>
          <a href="/api/health" target="_blank">GET /api/health</a> - Проверка сервера<br>
          <a href="/api/stats" target="_blank">GET /api/stats</a> - Статистика
        </div>
        
        <div class="endpoint">
          <strong>👤 Тестовые пользователи:</strong><br>
          • 11111111-1111-1111-1111-111111111111 - Иван Иванов<br>
          • 22222222-2222-2222-2222-222222222222 - Анна Петрова<br>
          • 33333333-3333-3333-3333-333333333333 - Дмитрий Сидоров<br>
          • 44444444-4444-4444-4444-444444444444 - Мария Козлова
        </div>
        
        <p style="margin-top: 30px; font-size: 14px; opacity: 0.8;">
          Видео сохраняются в базе данных как Base64 (до 10MB)
        </p>
      </div>
    </body>
    </html>
  `);
});

// Все остальные запросы → index.html или 404
app.get('*', (req, res) => {
  // Если запрос начинается с /api/, возвращаем 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found: ' + req.path });
  }
  
  // Проверяем существование файла
  const filePath = path.join(__dirname, 'public', req.path);
  const fs = require('fs');
  
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  
  // Проверяем с расширением .html
  const htmlPath = filePath + '.html';
  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  
  // Если ничего не найдено
  res.status(404).send('Page not found');
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🌐 Доступен по адресу: http://localhost:${PORT}`);
  console.log(`📹 Reels: http://localhost:${PORT}/reels-feed.html`);
  console.log(`⬆️ Upload: http://localhost:${PORT}/upload-video.html`);
  console.log(`✅ Health: http://localhost:${PORT}/api/health`);
});
