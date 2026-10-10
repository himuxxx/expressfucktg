// lib/analytics.js – Track checks and user stats
import { getDB } from './db.js';

async function getChecksCol() {
  const db = await getDB();
  return db.collection('checks');
}

// ===== চেক লগ করা (প্রতিটি চেকের পর কল হবে) =====
export async function logCheck(username, combo, hit) {
  try {
    const col = await getChecksCol();
    await col.insertOne({
      username: username.toLowerCase(),
      combo,
      hit: hit === true,
      timestamp: new Date()
    });
  } catch (e) {
    // silent fail — analytics চেকিং আটকাবে না
  }
}

// ===== সব স্ট্যাট =====
export async function getStats() {
  const col = await getChecksCol();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 3600 * 1000);

  const [total, today, week, hitsTotal, hitsToday, uniqueUsers] = await Promise.all([
    col.countDocuments({}),
    col.countDocuments({ timestamp: { $gte: todayStart } }),
    col.countDocuments({ timestamp: { $gte: weekStart } }),
    col.countDocuments({ hit: true }),
    col.countDocuments({ hit: true, timestamp: { $gte: todayStart } }),
    col.distinct('username')
  ]);

  return {
    total,
    today,
    week,
    hitsTotal,
    hitsToday,
    uniqueUsers: uniqueUsers.length
  };
}

// ===== প্রতি ইউজারের ব্রেকডাউন =====
export async function getUserStats() {
  const col = await getChecksCol();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const result = await col.aggregate([
    {
      $group: {
        _id: '$username',
        total: { $sum: 1 },
        hits: { $sum: { $cond: ['$hit', 1, 0] } },
        lastActive: { $max: '$timestamp' }
      }
    },
    {
      $lookup: {
        from: 'checks',
        let: { user: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$username', '$$user'] }, timestamp: { $gte: todayStart } } },
          { $count: 'today' }
        ],
        as: 'todayArr'
      }
    },
    { $addFields: { today: { $ifNull: [{ $arrayElemAt: ['$todayArr.today', 0] }, 0] } } },
    { $project: { todayArr: 0 } },
    { $sort: { total: -1 } },
    { $limit: 100 }
  ]).toArray();

  return result.map(r => ({
    username: r._id,
    total: r.total,
    today: r.today,
    hits: r.hits,
    lastActive: r.lastActive
  }));
}

// ===== সাম্প্রতিক চেক রিয়েল-টাইম =====
export async function getRecentChecks(limit = 20) {
  const col = await getChecksCol();
  const items = await col.find({}).sort({ timestamp: -1 }).limit(limit).toArray();
  return items.map(i => ({
    username: i.username,
    combo: i.combo,
    hit: i.hit,
    timestamp: i.timestamp
  }));
}

// ===== পুরনো লগ পরিষ্কার (৩০ দিনের বেশি) =====
export async function cleanOldLogs() {
  const col = await getChecksCol();
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  await col.deleteMany({ timestamp: { $lt: cutoff } });
}
