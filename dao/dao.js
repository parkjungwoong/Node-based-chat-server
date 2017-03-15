var Promise = require("bluebird");
var mysql = require('mysql');
var credential = require('../private/credentials').mysql.production;

var db = mysql.createPool({
    host                : credential.host,
    port                : credential.port,
    user                : credential.user,
    password            : credential.password,
    database            : credential.database,
    connectionLimit     : credential.connectionLimit,
    waitForConnections  : credential.waitForConnections,
    multipleStatements  : true,
    timezone: 'KST'
});

module.exports = {

    selectSessionToken: function (user_id,token) {
        return new Promise(function (resolve, reject) {
            db.getConnection(function(err, connection) {
                connection.query( 'SELECT * FROM session_token WHERE id = '+mysql.escape(user_id)+' AND token='+mysql.escape(token)+' AND type = "mobile"', function(err, rows) {
                    connection.release();
                    if(err){
                        reject(err);
                    }
                    resolve(rows);
                });

                if(err){
                    connection.release();
                    reject(err);
                }
            });
        });
    },

    //채팅방 찾기 (방코드 또는 id로)
    selectChatRoom : function (room_code) {
        return new Promise(function (resolve, reject) {
            db.getConnection(function(err, connection) {
                var sql = '';
                if(typeof room_code === 'string'){
                    sql = "SELECT\
                            DISTINCT room\
                            FROM\
                                group_chat\
                            WHERE\
                                room = "+mysql.escape(room_code);
                } else if(Array.isArray(room_code)){
                    sql =
                    "SELECT\
                        room, group_concat(id order by id+0) as users\
                    FROM\
                        group_chat\
                    GROUP BY\
                        room\
                    HAVING\
                        users = "+mysql.escape(room_code.join(','));
                }
               // console.log('sql',sql);
                connection.query( sql, function(err, rows) {
                    connection.release();
                    if(err){
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });

                if(err){
                    connection.release();
                    reject(err);
                }
            });
        });
    },

    //방 코드 입력
    insertRoomCode : function (room_code,ids,start_num) {
        return new Promise(function (resolve, reject) {
            db.getConnection(function(err,connection){
                connection.beginTransaction(function(err) {
                    if (err) { connection.release();resolve(false); }

                    var sqls = '';

                    if(start_num !== undefined){
                        for(var i in ids){
                            sqls += 'INSERT INTO group_chat (room,id,start_num) VALUES ('+mysql.escape(room_code)+','+mysql.escape(ids[i])+','+mysql.escape(start_num)+');';
                        }
                    } else {
                        for(var i in ids){
                            sqls += 'INSERT INTO group_chat (room,id) VALUES ('+mysql.escape(room_code)+','+mysql.escape(ids[i])+');';
                        }
                    }

                    connection.query(sqls,function(err, result) {
                        if (err) {
                            reject(err);
                            connection.rollback();
                            connection.release();
                        } else {
                            connection.commit(function(err) {
                                if (err) {
                                    connection.rollback();
                                    reject(err);
                                } else {
                                    resolve(true);
                                }
                                connection.release();
                            });
                        }
                    });
                });
            });
        });
    },

    //메시지 읽음 처리 @return 메시지번호, 읽음수
    updateMessageReadFlag : function(room_code,me){
        return new Promise(function (resolve, reject) {
            db.getConnection(function(err,connection){
                connection.beginTransaction(function(err) {
                    if (err) { connection.release();resolve(false); }
                    connection.query("SELECT num,flag FROM message WHERE room=? AND flag NOT LIKE ? AND flag != 'system';",[room_code,'%'+me+'%'],function(err, result) {
                        if (err) {
                            resolve(err);
                            connection.rollback();
                            connection.release();
                        } else {
                            var sqls = '';
                            var res_data = [];
                            for(var i=0; i<result.length; i++){
                                sqls += "UPDATE message SET flag='"+result[i].flag+','+me+"' WHERE num="+result[i].num+";";
                                res_data.push({num:result[i].num, flag:result[i].flag.split(',').length+1});
                            }
                            //console.log('updateMessageReadFlag',res_data);
                            if(sqls != ''){
                                connection.query(sqls,function(err, result) {
                                    if (err) {
                                        reject(err);
                                        connection.rollback();
                                        connection.release();
                                    } else {
                                        connection.commit(function(err) {
                                            if (err) {
                                                connection.rollback();
                                                reject(err);
                                            } else {
                                                resolve(res_data);
                                            }
                                            connection.release();
                                        });
                                    }
                                });
                            } else {
                                connection.commit(function(err) {
                                    if (err) {
                                        connection.rollback();
                                        reject(err);
                                    } else {
                                        resolve(res_data);
                                    }
                                    connection.release();
                                });
                            }
                        }
                    });
                });
            });
        });
    },

    //메시지 입력
    insertMessage : function (room_code,sender,message,flag) {
        return new Promise(function (resolve, reject) {
            db.getConnection(function(err, connection) {
                connection.query('INSERT INTO message (sender,room,message,flag) VALUES(?,?,?,?);',[sender,room_code,message,flag], function(err, rows) {
                    if(err){
                        connection.release();
                        reject(err);
                    } else {
                        connection.query('select LAST_INSERT_ID() as message_num;',function (err,message_num) {
                            connection.release();
                            if(err){
                                reject(err);
                            } else {
                                resolve(message_num[0].message_num);
                            }
                        });
                    }
                });

                if(err){
                    connection.release();
                    reject(err);
                }
            });
        });
    },

    //메시지 더보기 - 특정 번호 이전꺼
    selectMoreMessage : function (room_code,last_num,me) {
        return new Promise(function (resolve, reject) {
            db.getConnection(function(err, connection) {
                connection.query( "SELECT * FROM (\
                                        SELECT m.*,u.name FROM message m LEFT JOIN user_info u ON m.sender = u.id \
                                            WHERE room= ? \
                                            AND num < ? \
                                            AND num >= (SELECT IFNULL(start_num,0) FROM group_chat WHERE room = ? AND id = ?)\
                                            ORDER BY num DESC LIMIT 10 \
                                                        ) as a"
                    ,[room_code, last_num,room_code,me],function(err, rows) {
                        connection.release();
                        if(err){
                            reject(err);
                        } else {
                            for(var i in rows){
                                rows[i].flag != null ? rows[i].flag = rows[i].flag.split(',').length : rows[i].flag = 0;
                            }
                            resolve(rows);
                        }
                    });

                if(err){
                    connection.release();
                    reject(err);
                }
            });
        });
    },

    //최근 메시지 20개 가져오기
    selectMessageLimit20: function (room_code,me) {
        return new Promise(function (resolve, reject) {
            db.getConnection(function(err, connection) {
                connection.query( "SELECT * FROM (\
                                        SELECT m.*,u.name FROM message m LEFT JOIN user_info u ON m.sender = u.id \
                                            WHERE room= ? \
                                            AND num >= (\
                                                            SELECT IFNULL(MAX(num)-10,0) FROM message \
                                                                WHERE room= ? \
                                                                AND flag != 'system'\
                                                                AND flag NOT LIKE ? \
                                                        ) \
                                            AND num >= (SELECT IFNULL(start_num,0) FROM group_chat WHERE room = ? AND id = ?)\
                                            ORDER BY num DESC LIMIT 20 \
                                                        ) as a ORDER BY num"
                                ,[room_code, room_code,'%'+me+'%',room_code,me],function(err, rows) {
                    connection.release();
                    if(err){
                        reject(err);
                    } else {
                        for(var i in rows){
                            rows[i].flag != null ? rows[i].flag = rows[i].flag.split(',').length : rows[i].flag = 0;
                        }
                        resolve(rows);
                    }
                });

                if(err){
                    connection.release();
                    reject(err);
                }
            });
        });
    },

    //해당 채팅방 회원 정보
    selectUserInChatRoom: function (room_code) {
        return new Promise(function (resolve, reject) {
            db.getConnection(function(err, connection) {
                connection.query('SELECT u.name,u.id,start_num FROM group_chat g LEFT JOIN user_info u ON g.id = u.id WHERE room = ?',[room_code], function(err, rows) {
                    connection.release();
                    if(err){
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });

                if(err){
                    connection.release();
                    reject(err);
                }
            });
        });
    },

    //메시지 읽은 사람 가져오기
    selectWhoReadMessage: function (message_num) {
        return new Promise(function (resolve, reject) {
            db.getConnection(function(err, connection) {
                connection.query( "SELECT flag FROM message WHERE num = ?", [message_num],function(err, rows) {
                    if(err){
                        connection.release();
                        reject(err);
                    } else {
                        if(rows.length == 1){
                            connection.release();
                            resolve(rows[0].flag.split(','));
                            /*
                            var flag = rows[0].flag.split(',');
                            flag = flag.map(function (item) {
                                return item;
                            });
                            connection.query('SELECT name,id FROM user_info WHERE id IN (?)',[flag],function (err,read_member) {
                                connection.release();
                                if(err){
                                    reject(err);
                                } else {
                                    resolve(read_member);
                                }
                            });
                            */
                        } else {
                            connection.release();
                            resolve([]);
                        }
                    }
                });

                if(err){
                    connection.release();
                    reject(err);
                }
            });
        });
    },
    
    //방 나가기
    deleteRoom : function (room_code,id) {
        return new Promise(function (resolve, reject) {
            db.getConnection(function(err, connection) {
                connection.query( "DELETE FROM group_chat WHERE room = ? AND id = ?", [room_code,id],function(err, rows) {
                    connection.release();
                    if(err){
                        reject(err);
                    } else {
                        resolve(true);
                    }
                });

                if(err){
                    connection.release();
                    reject(err);
                }
            });
        });
    },

    //뱃지 업데이트
    updateBadge : function(badge,me){
        return new Promise(function (resolve, reject) {
            db.getConnection(function(err, connection) {

                if(typeof badge !== 'number'){
                   badge = 0;
                }
                var sql = 'UPDATE device_info SET badge = '+badge+' WHERE id = "'+me+'";';

                connection.query(sql,function(err, result) {
                    connection.release();
                    if(err){
                        console.log('updateBadge',err);
                        reject();
                    } else {
                        resolve();
                    }
                });

                if(err){
                    connection.release();
                    console.log('updateBadge',err);
                    reject();
                }
            });
        });

    },
    
    //메시지 모두 지우기
    deleteAllMessage : function (room_code) {
        
    }


}