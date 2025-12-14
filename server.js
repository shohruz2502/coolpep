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
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());

// Проверка подключения к базе данных
pool.connect((err, client, release) => {
  if (err) {
    console.error('Ошибка подключения к базе данных:', err);
  } else {
    console.log('Успешное подключение к базе данных Neon');
    release();
  }
});

// API маршруты

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
      verificationCode: '1234', // Для демо
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

// 3. Получить профиль
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

    // Получаем статистику
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM friends WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted') as friends_count,
        (SELECT COUNT(*) FROM community_members WHERE user_id = $1) as communities_count,
        (SELECT COUNT(*) FROM private_messages WHERE sender_id = $1 OR receiver_id = $1) as messages_count
    `, [userId]);

    const user = result.rows[0];
    user.stats = stats.rows[0];

    res.json({ success: true, user });

  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 4. Обновить аватар
app.post('/api/user/:id/avatar', async (req, res) => {
  try {
    const userId = req.params.id;
    const { avatarUrl } = req.body;

    await pool.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2',
      [avatarUrl, userId]
    );

    res.json({ success: true, avatarUrl });

  } catch (error) {
    console.error('Ошибка обновления аватарки:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 5. Друзья - поиск
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

// 6. Друзья - отправить запрос
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

// 7. Друзья - получить список
app.get('/api/friends/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    const friends = await pool.query(`
      SELECT u.id, u.name, u.surname, u.avatar_url, f.status
      FROM friends f
      JOIN users u ON (f.friend_id = u.id OR f.user_id = u.id)
      WHERE (f.user_id = $1 OR f.friend_id = $1)
        AND u.id != $1
      ORDER BY f.created_at DESC
    `, [userId]);

    res.json({ success: true, friends: friends.rows });

  } catch (error) {
    console.error('Ошибка получения друзей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 8. Друзья - ответить на запрос
app.post('/api/friends/respond', async (req, res) => {
  try {
    const { requestId, accept } = req.body;

    const status = accept ? 'accepted' : 'rejected';
    await pool.query(
      'UPDATE friends SET status = $1 WHERE id = $2',
      [status, requestId]
    );

    res.json({ success: true, message: accept ? 'Принято' : 'Отклонено' });

  } catch (error) {
    console.error('Ошибка обработки запроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 9. Сообщества - создать
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

// 10. Сообщества - поиск
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

// 11. Сообщества - мои
app.get('/api/communities/my/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    const result = await pool.query(`
      SELECT c.*, cm.role, cm.is_muted, COUNT(cm2.user_id) as members_count
      FROM communities c
      JOIN community_members cm ON c.id = cm.community_id
      LEFT JOIN community_members cm2 ON c.id = cm2.community_id
      WHERE cm.user_id = $1
      GROUP BY c.id, cm.role, cm.is_muted
      ORDER BY cm.joined_at DESC
    `, [userId]);

    res.json({ success: true, communities: result.rows });

  } catch (error) {
    console.error('Ошибка получения сообществ:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 12. Сообщества - вступить
app.post('/api/communities/join', async (req, res) => {
  try {
    const { communityId, userId } = req.body;

    await pool.query(
      'INSERT INTO community_members (community_id, user_id) VALUES ($1, $2)',
      [communityId, userId]
    );

    res.json({ success: true, message: 'Вы вступили в сообщество' });

  } catch (error) {
    console.error('Ошибка вступления в сообщество:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 13. Сообщения сообщества
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

// 14. Отправить сообщение в сообщество
app.post('/api/communities/:id/messages', async (req, res) => {
  try {
    const communityId = req.params.id;
    const { userId, content } = req.body;

    // Проверяем, не в муте ли пользователь
    const member = await pool.query(
      'SELECT is_muted FROM community_members WHERE community_id = $1 AND user_id = $2',
      [communityId, userId]
    );

    if (member.rows.length > 0 && member.rows[0].is_muted) {
      return res.status(403).json({ error: 'Вам закрыли рот в этом сообществе' });
    }

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

// 15. Модерация - закрыть рот
app.post('/api/communities/:id/mute', async (req, res) => {
  try {
    const communityId = req.params.id;
    const { userId, adminId, reason } = req.body;

    // Проверяем права админа
    const admin = await pool.query(
      'SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2',
      [communityId, adminId]
    );

    if (admin.rows.length === 0 || !['admin', 'moderator'].includes(admin.rows[0].role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    await pool.query(
      `UPDATE community_members 
       SET is_muted = true, muted_by = $1, mute_reason = $2
       WHERE community_id = $3 AND user_id = $4`,
      [adminId, reason, communityId, userId]
    );

    res.json({ success: true, message: 'Пользователю закрыт рот' });

  } catch (error) {
    console.error('Ошибка мута:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 16. Модерация - открыть рот
app.post('/api/communities/:id/unmute', async (req, res) => {
  try {
    const communityId = req.params.id;
    const { userId, adminId } = req.body;

    const admin = await pool.query(
      'SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2',
      [communityId, adminId]
    );

    if (admin.rows.length === 0 || !['admin', 'moderator'].includes(admin.rows[0].role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    await pool.query(
      'UPDATE community_members SET is_muted = false WHERE community_id = $1 AND user_id = $2',
      [communityId, userId]
    );

    res.json({ success: true, message: 'Пользователю открыли рот' });

  } catch (error) {
    console.error('Ошибка размута:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 17. Получить заблокированных пользователей
app.get('/api/communities/:id/muted', async (req, res) => {
  try {
    const communityId = req.params.id;

    const mutedUsers = await pool.query(`
      SELECT cm.user_id, u.name, u.surname, u.avatar_url, cm.mute_reason
      FROM community_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.community_id = $1 AND cm.is_muted = true
    `, [communityId]);

    res.json({ success: true, mutedUsers: mutedUsers.rows });

  } catch (error) {
    console.error('Ошибка получения заблокированных:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 18. Личные сообщения - диалоги
app.get('/api/messages/conversations/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    const conversations = await pool.query(`
      SELECT DISTINCT 
        CASE 
          WHEN sender_id = $1 THEN receiver_id
          ELSE sender_id
        END as other_user_id,
        u.name, u.surname, u.avatar_url,
        (SELECT content FROM private_messages 
         WHERE (sender_id = $1 AND receiver_id = u.id)
            OR (sender_id = u.id AND receiver_id = $1)
         ORDER BY created_at DESC LIMIT 1) as last_message
      FROM private_messages pm
      JOIN users u ON (u.id = pm.sender_id OR u.id = pm.receiver_id) AND u.id != $1
      WHERE sender_id = $1 OR receiver_id = $1
      GROUP BY other_user_id, u.id
    `, [userId]);

    res.json({ success: true, conversations: conversations.rows });

  } catch (error) {
    console.error('Ошибка получения диалогов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 19. Личные сообщения - история
app.get('/api/messages/:user1Id/:user2Id', async (req, res) => {
  try {
    const { user1Id, user2Id } = req.params;

    const messages = await pool.query(`
      SELECT pm.*, 
             sender.name as sender_name, sender.avatar_url as sender_avatar,
             receiver.name as receiver_name
      FROM private_messages pm
      JOIN users sender ON pm.sender_id = sender.id
      JOIN users receiver ON pm.receiver_id = receiver.id
      WHERE (pm.sender_id = $1 AND pm.receiver_id = $2)
         OR (pm.sender_id = $2 AND pm.receiver_id = $1)
      ORDER BY pm.created_at ASC
      LIMIT 100
    `, [user1Id, user2Id]);

    res.json({ success: true, messages: messages.rows });

  } catch (error) {
    console.error('Ошибка получения сообщений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 20. Отправить личное сообщение
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

// 21. Reels - лента
app.get('/api/reels/feed', async (req, res) => {
  try {
    const reels = await pool.query(`
      SELECT r.*, u.name, u.avatar_url
      FROM reels r
      JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
      LIMIT 20
    `);

    res.json({ success: true, reels: reels.rows });

  } catch (error) {
    console.error('Ошибка получения Reels:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 22. Reels - создать
app.post('/api/reels', async (req, res) => {
  try {
    const { userId, videoUrl, caption, music } = req.body;

    const result = await pool.query(
      'INSERT INTO reels (user_id, video_url, caption, music) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, videoUrl, caption, music]
    );

    res.json({ success: true, reel: result.rows[0] });

  } catch (error) {
    console.error('Ошибка создания Reel:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 23. Reels - лайк
app.post('/api/reels/:id/like', async (req, res) => {
  try {
    const reelId = req.params.id;
    const { userId } = req.body;

    // Проверяем, не лайкал ли уже
    const existing = await pool.query(
      'SELECT id FROM reel_likes WHERE reel_id = $1 AND user_id = $2',
      [reelId, userId]
    );

    if (existing.rows.length > 0) {
      // Удаляем лайк
      await pool.query('DELETE FROM reel_likes WHERE reel_id = $1 AND user_id = $2', [reelId, userId]);
      await pool.query('UPDATE reels SET likes_count = likes_count - 1 WHERE id = $1', [reelId]);
    } else {
      // Добавляем лайк
      await pool.query('INSERT INTO reel_likes (reel_id, user_id) VALUES ($1, $2)', [reelId, userId]);
      await pool.query('UPDATE reels SET likes_count = likes_count + 1 WHERE id = $1', [reelId]);
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Ошибка лайка:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 24. VASTAPAE - лента
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

// 25. VASTAPAE - создать пост
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

// 26. LOVE чаты - создать
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

// 27. LOVE чаты - сообщения
app.get('/api/love/:chatId/messages', async (req, res) => {
  try {
    const chatId = req.params.chatId;

    const messages = await pool.query(`
      SELECT lm.*, u.name, u.avatar_url
      FROM love_messages lm
      JOIN users u ON lm.sender_id = u.id
      WHERE lm.love_chat_id = $1
      ORDER BY lm.created_at ASC
      LIMIT 100
    `, [chatId]);

    res.json({ success: true, messages: messages.rows });

  } catch (error) {
    console.error('Ошибка получения сообщений LOVE чата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 28. Обслуживание статических файлов
app.use(express.static('public'));

// 29. Маршрут для проверки здоровья
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'Connected'
  });
});

// 30. Все остальные запросы → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`API доступен по адресу: http://localhost:${PORT}/api/`);
});