const { db, checkIfUsersExist } = require('../db/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const stream_quota_starter = 600;
const stream_quota_premium = 3000;
const stream_quota_ultimate = 12000;
const stream_quota_elite = 43200;

class User {
  static findByEmail(email) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row);
      });
    });
  }
  static findByUsername(username) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row);
      });
    });
  }
  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
        if (err) {
          console.error('Database error in findById:', err);
          return reject(err);
        }
        resolve(row);
      });
    });
  }
  static async create(userData) {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const userId = uuidv4();
	  
	  const activeUntil = new Date();
	  activeUntil.setDate(activeUntil.getDate() + 30);
	  
	  let streamQuota = 0;
	  const plan = userData.plan_id || 'starter';
	  if (plan === 'starter') streamQuota = stream_quota_starter;
	  else if (plan === 'premium') streamQuota = stream_quota_premium;
	  else if (plan === 'ultimate') streamQuota = stream_quota_ultimate;
	  else if (plan === 'elite') streamQuota = stream_quota_elite;

      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (id, username, password, avatar_path, user_role, status, plan_id, disk_limit, stream_quota, stream_used, active_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [userId, userData.username, hashedPassword, userData.avatar_path || null, userData.user_role || 'admin', userData.status || 'active', userData.plan_id || 'starter', userData.disk_limit || 0, streamQuota, 0, activeUntil.toISOString()],
          function (err) {
            if (err) {
              console.error("DB error during user creation:", err);
              return reject(err);
            }
            console.log("User created successfully with ID:", userId);
            resolve({ id: userId, username: userData.username, user_role: userData.user_role || 'admin', status: userData.status || 'active', plan_id: userData.plan_id || 'starter', disk_limit: userData.disk_limit || 0, stream_quota: streamQuota, stream_used: 0, active_until: activeUntil  });
          }
        );
      });
    } catch (error) {
      console.error("Error in User.create:", error);
      throw error;
    }
  }
  static update(userId, userData) {
    const fields = [];
    const values = [];
    Object.entries(userData).forEach(([key, value]) => {
      fields.push(`${key} = ?`);
      values.push(value);
    });
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    return new Promise((resolve, reject) => {
      db.run(query, values, function (err) {
        if (err) {
          return reject(err);
        }
        resolve({ id: userId, ...userData });
      });
    });
  }
  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static findAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM users ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
          console.error('Database error in findAll:', err);
          return reject(err);
        }
        resolve(rows);
      });
    });
  }

  static updateStatus(userId, status) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, userId],
        function (err) {
          if (err) {
            console.error('Database error in updateStatus:', err);
            return reject(err);
          }
          resolve({ id: userId, status });
        }
      );
    });
  }

  static updateRole(userId, role) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET user_role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [role, userId],
        function (err) {
          if (err) {
            console.error('Database error in updateRole:', err);
            return reject(err);
          }
          resolve({ id: userId, user_role: role });
        }
      );
    });
  }

  static delete(userId) {
    return new Promise(async (resolve, reject) => {
      try {
        const Video = require('./Video');
        const Stream = require('./Stream');
        
        const userVideos = await Video.findAll(userId);
        const userStreams = await Stream.findAll(userId);
        
        for (const video of userVideos) {
          try {
            await Video.delete(video.id);
          } catch (videoDeleteError) {
            console.error(`Error deleting video ${video.id}:`, videoDeleteError);
          }
        }
        
        for (const stream of userStreams) {
          try {
            await Stream.delete(stream.id, userId);
          } catch (streamDeleteError) {
            console.error(`Error deleting stream ${stream.id}:`, streamDeleteError);
          }
        }
        
        db.run('DELETE FROM users WHERE id = ?', [userId], function (err) {
          if (err) {
            console.error('Database error in delete:', err);
            return reject(err);
          }
          resolve({ 
            id: userId, 
            deleted: true, 
            videosDeleted: userVideos.length,
            streamsDeleted: userStreams.length 
          });
        });
      } catch (error) {
        console.error('Error in user deletion process:', error);
        reject(error);
      }
    });
  }

  static updateProfile(userId, updateData) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      
      if (updateData.username) {
        fields.push('username = ?');
        values.push(updateData.username);
      }
      
      if (updateData.user_role) {
        fields.push('user_role = ?');
        values.push(updateData.user_role);
      }

      if (updateData.plan_id !== undefined){
        fields.push('plan_id = ?');
        values.push(updateData.plan_id);
      }
      
      if (updateData.status) {
        fields.push('status = ?');
        values.push(updateData.status);
      }
      
      if (updateData.avatar_path) {
        fields.push('avatar_path = ?');
        values.push(updateData.avatar_path);
      }
      
      if (updateData.password) {
        fields.push('password = ?');
        values.push(updateData.password);
      }
	  
	  if (updateData.plan_id !== undefined) {
        fields.push('plan_id = ?');
        values.push(updateData.plan_id);
        
        let streamQuota = 0;
        const plan = updateData.plan_id;
	    if (plan === 'starter') streamQuota = stream_quota_starter;
	    else if (plan === 'premium') streamQuota = stream_quota_premium;
	    else if (plan === 'ultimate') streamQuota = stream_quota_ultimate;
	    else if (plan === 'elite') streamQuota = stream_quota_elite;
        
        fields.push('stream_quota = ?');
        values.push(streamQuota);
      }
	  
	  if (updateData.stream_quota !== undefined && updateData.stream_quota !== '') {
		  fields.push('stream_quota = ?');
		  values.push(updateData.stream_quota);
	  }
	  
	  if (updateData.active_until !== undefined && updateData.active_until !== '') {
		  fields.push('active_until = ?');
		  values.push(new Date(updateData.active_until).toISOString());
	  }

      if (updateData.disk_limit !== undefined) {
        fields.push('disk_limit = ?');
        values.push(updateData.disk_limit);
      }
      
      if (fields.length === 0) {
        return resolve({ id: userId, message: 'No fields to update' });
      }
      
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);
      
      const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
      
      db.run(sql, values, function (err) {
        if (err) {
          console.error('Database error in updateProfile:', err);
          return reject(err);
        }
        resolve({ id: userId, changes: this.changes });
      });
    });
  }

  static getDiskUsage(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(file_size), 0) as total_size FROM videos WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) {
            console.error('Database error in getDiskUsage:', err);
            return reject(err);
          }
          resolve(row ? row.total_size : 0);
        }
      );
    });
  }
  
  static renewSubscription(userId) {
    return new Promise(async (resolve, reject) => {
      try {
        const user = await this.findById(userId);
        if (!user) return reject(new Error('User tidak ditemukan'));

        let activeUntil = new Date();
        if (user.active_until) {
            const currentExpiry = new Date(user.active_until);
            if (currentExpiry > activeUntil) {
                activeUntil = currentExpiry;
            }
        }
        activeUntil.setDate(activeUntil.getDate() + 30);

        let streamQuota = 0;
        const plan = user.plan_id || 'starter';
        if (plan === 'starter') streamQuota = stream_quota_starter;
        else if (plan === 'premium') streamQuota = stream_quota_premium;
        else if (plan === 'ultimate') streamQuota = stream_quota_ultimate;
        else if (plan === 'elite') streamQuota = stream_quota_elite;

        const query = `
          UPDATE users 
          SET active_until = ?, 
              stream_quota = ?, 
              stream_used = 0, 
              status = 'active' 
          WHERE id = ?
        `;

        db.run(query, [activeUntil.toISOString(), streamQuota, userId], function(err) {
          if (err) return reject(err);
          resolve(this.changes);
        });

      } catch (error) {
        reject(error);
      }
    });
  }
  
}

module.exports = User;