/**
 * Created by jungpark on 2016. 11. 22..
 * 채팅 서비스 로직
 */
var dao = require('../dao/dao.js');
var Promise = require("bluebird");


function compNumberReverse(a, b) {
    return a - b;
}

function generateUUID() {
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
};


module.exports = {

    //방 접속 검사
    joinCheck: function (param) {
        var selectRoomCode = new Promise(function (resolve, reject) {
            //방 코드로 요청하면
            if(param.room_code !== undefined && param.room_code != '' && param.room_code.match(',') == null){
                //룸코드 검증
                dao.selectChatRoom(param.room_code).then(function (data) {
                    //console.log(JSON.stringify(data));
                    if(data.length > 0 && data[0].room){
                        resolve(data[0].room);
                    } else {
                        //방코드 생성
                        reject({err:'존재하지 않는 룸코드'});
                    }
                });
            } else if(param.room_code !== undefined && param.room_code != '' && param.room_code.match(',') != null){ //상대방 id로 요청 하면
                //id정렬
                var ids = param.room_code.split(',');

                ids.sort(compNumberReverse);

                ids = ids.reduce(function(a,b){ //중복 제거
                    if(a.indexOf(b)<0){
                        a.push(b);
                    }
                    return a;
                },[]);

                //1:1이면 기존 방코드 찾고 있으면 거기로 없으면 생성
                if(ids.length == 2){
                    //룸코드 찾기
                    dao.selectChatRoom(ids).then(function (data) {
                        if(data.length > 0 && data[0].room){
                            resolve(data[0].room);
                        } else {
                            //룸코드 생성
                            var room_code = generateUUID();
                            dao.insertRoomCode(room_code,ids).then(function (data) {
                                if(data){
                                    resolve(room_code);
                                } else {
                                    reject({err:'insertRoomCode Err'})
                                }
                            }).catch(function (err) {
                                reject({err:'insertRoomCode Err',err_info:err});
                            });
                        }
                    });
                } else { //3명 이상이면 단톡방 생성
                    //룸코드 생성
                    var room_code = generateUUID();
                    dao.insertRoomCode(room_code,ids).then(function (data) {
                        if(data){
                            resolve(room_code);
                        } else {
                            reject({err:'insertRoomCode Err'})
                        }
                    }).catch(function (err) {
                        reject({err:'insertRoomCode Err',err_info:err});
                    });
                }
            } else {
                reject({err:'룸코드가 없거나 ids가 배열이 아닙니다.'});
            }
        });

        return new Promise(function (resolve, reject) {
            selectRoomCode.then(function(room_code){
                //해당 룸 코드에 있는 사람들 정보
                var selectUser = dao.selectUserInChatRoom(room_code);

                var selectMessage = new Promise(function (resolve, reject) {
                    //해당 방의 모든 메시지 읽음 처리
                    dao.updateMessageReadFlag(room_code,param.me).then(function (read_meg_list) {
                        //해당 롬 코드에 있는 메시지 20개
                        dao.selectMessageLimit20(room_code,param.me).then(function (message_list) {
                            resolve({
                                read_meg_list:read_meg_list,//자신이 읽음 처리한 메시지 리스트 [{num,flag},....]
                                message_list:message_list
                            });
                        }).catch(function (err) {
                            console.log('selectMessageLimit20 ERR',err);
                            reject(err);
                        });
                    }).catch(function (err) {
                        console.log('updateMessageReadFlag ERR',err);
                        reject(err);
                    });
                });

                //최종 결과
                Promise.all([selectUser,selectMessage]).then(function(res){
                    //console.log('res[0]',res[0]);
                    //console.log('res[1]',JSON.stringify(res[1]));
                    resolve({
                        room_code:room_code,
                        member_list:res[0],
                        message_list:res[1].message_list,
                        read_meg_list:res[1].read_meg_list
                    });
                }).catch(function(err){
                    console.log('selectUser,selectMessage ERR',err);
                    reject(err);
                });
            }).catch(function (err) {
                console.log('selectRoomCode ERR',err);
                reject(err);
            });
        });
    },

    //메시지 읽은 사람 가져오기
    selectWhoReadMessage : function (param) {
        return dao.selectWhoReadMessage(param.num);
    },

    //메시지 저장
    insertMessage : function (param) {
        return dao.insertMessage(param.room_code,param.me,param.message,param.flag);
    },

    //메시지 더 가져오기
    selectMoreMessage : function (param) {
        return dao.selectMoreMessage(param.room_code,param.last_num,param.me);
    },

    //채팅방 초대
    inviteRoom : function (param) {
        return new Promise(function (resolve, reject) {
            dao.insertMessage(param.room_code,'system',param.message,'system').then(function (message_num) {
                dao.insertRoomCode(param.room_code,param.ids,message_num).then(function () {
                    resolve(message_num);
                }).catch(function (err) {
                   reject(err);
                });
            }).catch(function (err) {
                console.log('inviteRoom_insertMessage ERR',err);
                reject(err);
            });
        });
    },

    //방 나감
    leaveRoom : function (param) {
        return new Promise(function (resolve, reject) {
            dao.insertMessage(param.room_code,'system',param.message,'system').then(function (message_num) {
                dao.deleteRoom(param.room_code,param.id).then(function () {
                    resolve(message_num);
                }).catch(function (err) {
                    reject(err);
                });
            }).catch(function (err) {
                console.log('leaveRoom_insertMessage ERR',err);
                reject(err);
            });
        });
    },

    //뱃지 업데이트
    updateBadge : function (param) {
        return dao.updateBadge(param.badge,param.me);
    }

}