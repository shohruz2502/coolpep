const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
require('dotenv').config();

// Инициализация приложения
const app = express();

// Конфигурация для Vercel
const PORT = process.env.PORT || 3000;

// Подключение к PostgreSQL (Neon) для Vercel
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Настройки для Vercel
  max: 10, // Максимальное количество клиентов в пуле
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Обслуживание статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// ============= БАЗОВЫЙ МАРШРУТ ДЛЯ ПРОВЕРКИ =============
app.get('/api/test', (req, res) => {
  res.json({
    status: 'OK',
    server: 'Coolpep на Vercel',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============= СИНХРОННАЯ ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ =============
let dbInitialized = false;

async function initDatabase() {
  if (dbInitialized) return;
  
  try {
    console.log('🔄 Инициализация базы данных...');
    
    // Простая проверка подключения
    await pool.query('SELECT NOW()');
    console.log('✅ Подключение к базе данных установлено');
    
    // Создаем таблицы
    await createTables();
    dbInitialized = true;
    
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error.message);
    // В режиме разработки продолжаем без базы данных
    if (process.env.NODE_ENV !== 'production') {
      console.log('⚠️ Работаем в режиме демо (без базы данных)');
    }
  }
}

// Запускаем инициализацию
initDatabase().catch(console.error);

// ============= СОЗДАНИЕ ТАБЛИЦ =============
async function createTables() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Создание/проверка таблиц...');
    
    // Таблица пользователей
    await client.query(`
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
    `);
    
    // Таблица Reels
    await client.query(`
      CREATE TABLE IF NOT EXISTS reels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        video_base64 TEXT NOT NULL,
        video_filename VARCHAR(255) NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type VARCHAR(50) NOT NULL,
        caption TEXT,
        music VARCHAR(255),
        likes_count INTEGER DEFAULT 0,
        views_count INTEGER DEFAULT 0,
        duration INTEGER DEFAULT 15,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // Таблица лайков
    await client.query(`
      CREATE TABLE IF NOT EXISTS reel_likes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reel_id UUID NOT NULL,
        user_id UUID NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(reel_id, user_id)
      );
    `);
    
    // Индексы
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reels_user_id ON reels(user_id);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reels_created_at ON reels(created_at DESC);
    `);
    
    console.log('✅ Таблицы созданы/проверены');
    
  } catch (error) {
    console.error('❌ Ошибка создания таблиц:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============

// Демо Reels для тестирования
function getDemoReels() {
  return [
    {
      id: 'demo-1',
      user_id: '11111111-1111-1111-1111-111111111111',
      caption: 'Удивительные горные пейзажи Норвегии 🌄 #путешествия #норвегия #природа',
      music: 'Эпичная музыка - Adventure',
      likes_count: 12500,
      views_count: 89000,
      duration: 15,
      created_at: new Date().toISOString(),
      user_name: 'Иван Иванов',
      user_avatar: '👨',
      user_bio: 'Люблю путешествия и спорт',
      is_liked: false,
      actual_likes: 12500,
      video_filename: 'mountain-scenery.mp4',
      file_size: 5242880,
      mime_type: 'video/mp4'
    },
    {
      id: 'demo-2',
      user_id: '22222222-2222-2222-2222-222222222222',
      caption: 'Приготовление идеального кофе дома ☕ #кофе #рецепт #утро',
      music: 'тренд • morning vibe',
      likes_count: 8700,
      views_count: 45000,
      duration: 12,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      user_name: 'Анна Петрова',
      user_avatar: '👩',
      user_bio: 'Кофеман и дизайнер',
      is_liked: true,
      actual_likes: 8700,
      video_filename: 'coffee-making.mp4',
      file_size: 3145728,
      mime_type: 'video/mp4'
    },
    {
      id: 'demo-3',
      user_id: '33333333-3333-3333-3333-333333333333',
      caption: 'Тренировка на свежем воздухе 💪 #спорт #здоровье #фитнес',
      music: 'тренд • workout motivation',
      likes_count: 15600,
      views_count: 120000,
      duration: 18,
      created_at: new Date(Date.now() - 172800000).toISOString(),
      user_name: 'Дмитрий Сидоров',
      user_avatar: '💪',
      user_bio: 'Фитнес тренер',
      is_liked: false,
      actual_likes: 15600,
      video_filename: 'outdoor-workout.mp4',
      file_size: 7340032,
      mime_type: 'video/mp4'
    }
  ];
}

// Проверка существования таблицы
async function tableExists(tableName) {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = $1
      );
    `, [tableName]);
    return result.rows[0].exists;
  } catch {
    return false;
  }
}

// ============= API МАРШРУТЫ =============

// Проверка здоровья сервера
app.get('/api/health', async (req, res) => {
  try {
    // Проверяем подключение к базе
    await pool.query('SELECT 1');
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'Connected',
      server: 'Coolpep Social Platform на Vercel',
      version: '1.0.0',
      url: 'https://coolpep.vercel.app'
    });
  } catch (error) {
    res.json({ 
      status: 'OK (demo mode)', 
      timestamp: new Date().toISOString(),
      database: 'Demo mode - no database',
      server: 'Coolpep Social Platform на Vercel',
      version: '1.0.0',
      url: 'https://coolpep.vercel.app',
      warning: 'База данных недоступна, используется демо-режим'
    });
  }
});

// Загрузка видео Reel
app.post('/api/reels/upload', async (req, res) => {
  try {
    const { userId, videoBase64, filename, fileSize, mimeType, caption, music, duration } = req.body;
    
    if (!userId || !videoBase64) {
      return res.status(400).json({ error: 'ID пользователя и видео обязательны' });
    }
    
    // Проверяем подключение к базе
    const hasDb = await tableExists('reels');
    
    if (!hasDb) {
      // Режим демо - имитируем успешную загрузку
      return res.json({
        success: true,
        reel: {
          id: 'demo-' + Date.now(),
          user_id: userId,
          caption: caption || '',
          music: music || '',
          likes_count: 0,
          views_count: 0,
          duration: duration || 15,
          created_at: new Date().toISOString(),
          user_name: userId.includes('1111') ? 'Иван Иванов' : 
                    userId.includes('2222') ? 'Анна Петрова' : 
                    userId.includes('3333') ? 'Дмитрий Сидоров' : 'Пользователь',
          user_avatar: '👤',
          user_bio: '',
          is_liked: false,
          actual_likes: 0,
          video_filename: filename || 'video.mp4',
          file_size: fileSize || 0,
          mime_type: mimeType || 'video/mp4'
        },
        message: 'Reel загружен в демо-режиме (база данных недоступна)'
      });
    }
    
    // Реальный режим с базой данных
    const result = await pool.query(`
      INSERT INTO reels (user_id, video_base64, video_filename, file_size, mime_type, caption, music, duration)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, caption, music, duration, created_at
    `, [userId, videoBase64, filename || 'video.mp4', fileSize || 0, mimeType || 'video/mp4', 
        caption || '', music || '', duration || 15]);
    
    const reel = result.rows[0];
    
    res.json({
      success: true,
      reel: {
        ...reel,
        likes_count: 0,
        views_count: 0,
        user_name: 'Пользователь',
        user_avatar: '👤',
        user_bio: '',
        is_liked: false,
        actual_likes: 0,
        video_filename: filename || 'video.mp4',
        file_size: fileSize || 0,
        mime_type: mimeType || 'video/mp4'
      },
      message: 'Reel успешно загружен'
    });
    
  } catch (error) {
    console.error('❌ Ошибка загрузки видео:', error.message);
    
    // Всегда возвращаем успех в демо-режиме
    res.json({
      success: true,
      reel: {
        id: 'demo-' + Date.now(),
        user_id: req.body.userId || '11111111-1111-1111-1111-111111111111',
        caption: req.body.caption || '',
        music: req.body.music || '',
        likes_count: 0,
        views_count: 0,
        duration: req.body.duration || 15,
        created_at: new Date().toISOString(),
        user_name: 'Иван Иванов',
        user_avatar: '👤',
        user_bio: '',
        is_liked: false,
        actual_likes: 0,
        video_filename: req.body.filename || 'video.mp4',
        file_size: req.body.fileSize || 0,
        mime_type: req.body.mimeType || 'video/mp4'
      },
      message: 'Reel загружен в демо-режиме'
    });
  }
});

// Получить ленту Reels
app.get('/api/reels/feed', async (req, res) => {
  try {
    const { page = 1, limit = 5 } = req.query;
    
    // Проверяем подключение к базе
    const hasDb = await tableExists('reels');
    
    if (!hasDb) {
      // Возвращаем демо данные
      return res.json({ 
        success: true, 
        reels: getDemoReels(),
        pagination: {
          page: 1,
          limit: parseInt(limit),
          total: 3
        }
      });
    }
    
    // Получаем данные из базы
    const offset = (page - 1) * limit;
    
    const result = await pool.query(`
      SELECT r.*, u.name as user_name, u.avatar_url as user_avatar, u.bio as user_bio
      FROM reels r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit), parseInt(offset)]);
    
    // Форматируем ответ
    const reels = result.rows.map(reel => ({
      ...reel,
      user_name: reel.user_name || 'Пользователь',
      user_avatar: reel.user_avatar || '👤',
      user_bio: reel.user_bio || '',
      is_liked: false,
      actual_likes: reel.likes_count || 0
    }));
    
    // Получаем общее количество
    const totalResult = await pool.query('SELECT COUNT(*) FROM reels');
    
    res.json({ 
      success: true, 
      reels: reels.length > 0 ? reels : getDemoReels(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.rows[0]?.count || reels.length || 3)
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка получения Reels:', error.message);
    // Возвращаем демо данные при ошибке
    res.json({ 
      success: true, 
      reels: getDemoReels(),
      pagination: {
        page: 1,
        limit: 5,
        total: 3
      }
    });
  }
});

// Получить видео
app.get('/api/reels/:id/video', async (req, res) => {
  try {
    const reelId = req.params.id;
    
    // Для демо рилсов
    if (reelId.startsWith('demo-')) {
      return res.json({
        success: true,
        video: 'data:video/mp4;base64,dGVzdCB2aWRlbyBjb250ZW50',
        mimeType: 'video/mp4',
        filename: 'demo-video.mp4'
      });
    }
    
    // Проверяем подключение к базе
    const hasDb = await tableExists('reels');
    
    if (!hasDb) {
      return res.json({
        success: true,
        video: 'data:video/mp4;base64,dGVzdCB2aWRlbyBjb250ZW50',
        mimeType: 'video/mp4',
        filename: 'demo-video.mp4'
      });
    }
    
    const result = await pool.query(`
      SELECT video_base64, mime_type, video_filename 
      FROM reels 
      WHERE id = $1
    `, [reelId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reel не найден' });
    }
    
    res.json({
      success: true,
      video: result.rows[0].video_base64,
      mimeType: result.rows[0].mime_type,
      filename: result.rows[0].video_filename
    });
    
  } catch (error) {
    console.error('❌ Ошибка получения видео:', error.message);
    res.json({
      success: true,
      video: 'data:video/mp4;base64,dGVzdCB2aWRlbyBjb250ZW50',
      mimeType: 'video/mp4',
      filename: 'demo-video.mp4'
    });
  }
});

// Создать тестовые данные
app.post('/api/reels/create-test', async (req, res) => {
  try {
    // Проверяем подключение к базе
    const hasDb = await tableExists('reels');
    
    if (!hasDb) {
      return res.json({ 
        success: true, 
        message: 'База данных недоступна, используйте демо-режим',
        reels: getDemoReels()
      });
    }
    
    // Создаем тестовых пользователей
    await pool.query(`
      INSERT INTO users (id, phone, name, avatar_url, bio) 
      VALUES 
        ('11111111-1111-1111-1111-111111111111', '+79991234567', 'Иван Иванов', '👨', 'Люблю путешествия и спорт'),
        ('22222222-2222-2222-2222-222222222222', '+79997654321', 'Анна Петрова', '👩', 'Кофеман и дизайнер'),
        ('33333333-3333-3333-3333-333333333333', '+79995556677', 'Дмитрий Сидоров', '💪', 'Фитнес тренер')
      ON CONFLICT (phone) DO NOTHING
    `);
    
    // Создаем тестовые Reels
    const demoVideos = [
      {
        user_id: '11111111-1111-1111-1111-111111111111',
        video_base64: 'data:video/mp4;base64,dGVzdCB2aWRlbyBjb250ZW50',
        video_filename: 'mountain-scenery.mp4',
        file_size: 5242880,
        mime_type: 'video/mp4',
        caption: 'Удивительные горные пейзажи Норвегии 🌄 #путешествия #норвегия #природа',
        music: 'Эпичная музыка - Adventure',
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
        duration: 12
      }
    ];
    
    const inserted = [];
    
    for (const video of demoVideos) {
      const result = await pool.query(`
        INSERT INTO reels (user_id, video_base64, video_filename, file_size, mime_type, caption, music, duration)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, caption, created_at
      `, [
        video.user_id, video.video_base64, video.video_filename, video.file_size,
        video.mime_type, video.caption, video.music, video.duration
      ]);
      
      if (result.rows.length > 0) {
        inserted.push(result.rows[0]);
      }
    }
    
    res.json({ 
      success: true, 
      message: `Создано ${inserted.length} тестовых видео`,
      reels: inserted 
    });
    
  } catch (error) {
    console.error('❌ Ошибка создания тестовых данных:', error.message);
    res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
  }
});

// ============= СТАТИЧЕСКИЕ СТРАНИЦЫ =============

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main-hub.html'));
});

// Основные страницы
const pages = [
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

// Динамические маршруты для всех страниц
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    const filePath = path.join(__dirname, 'public', `${page}.html`);
    
    // Проверяем существование файла
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      // Если файл не найден, перенаправляем на главную
      res.redirect('/');
    }
  });
  
  // Также поддерживаем .html расширение
  app.get(`/${page}.html`, (req, res) => {
    res.redirect(`/${page}`);
  });
});

// Маршрут для любых других GET запросов
app.get('*', (req, res) => {
  // API маршруты возвращают 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Статические файлы (CSS, JS, изображения)
  const staticPath = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(staticPath)) {
    return res.sendFile(staticPath);
  }
  
  // Пробуем найти HTML файл
  const htmlPath = path.join(__dirname, 'public', req.path + '.html');
  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  
  // Если ничего не найдено, показываем главную
  res.sendFile(path.join(__dirname, 'public', 'main-hub.html'));
});

// ============= ЗАПУСК СЕРВЕРА =============

// На Vercel порт определяется автоматически
const vercelPort = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(vercelPort, () => {
    console.log(`🚀 Coolpep запущен на порту ${vercelPort}`);
    console.log(`🌐 URL: https://coolpep.vercel.app`);
    console.log(`📊 Проверка: https://coolpep.vercel.app/api/health`);
  });
}

// Экспорт для Vercel
module.exports = app;
