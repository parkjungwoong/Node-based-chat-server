var express = require('express');
var http = require('http');
var app = express();
var chat_service = require('./services/chat_service.js');
var push = require('./lib/push-service');
var fs = require('fs');
var CORS = require('cors')();
var moment = require('moment-timezone'); // 현재 국가의 시간

moment.tz.setDefault("Asia/Seoul");
app.use(express.static(__dirname+'/public'));
app.use(CORS);
var httpServer = http.createServer(app).listen(3200, function(req,res){
    console.log('Socket IO server has been started');
});

var io = require('socket.io').listen(httpServer, {log:false, origins:'*:*'});

var cur_join_state = [];
/*
cur_join_state = [
    {room_code : '1234',cur_member_list : [{id:1,type:1,socket_id:xxxx},{id:2,type:2,socket_id:xxxx},{id:3,type:3,socket_id:xxxx},{id:4,type:1,socket_id:xxxx}], total_member : [1,2,3,4,5,6]},
    {room_code : '4321',cur_member_list : [....], total_member : [......]},
    ....... cur_member_list에서 type은 접속 형태를 나타냄 1 -> 모바일,2 -> 웹,3->둘 다 접속
]
*/

function showConsole() {
    cur_join_state.forEach(function (item) {
        console.log('======================================');
        console.log('|room_code:'+item.room_code+'\t|');
        console.log('|cur_member_list'+'\t|');
        item.cur_member_list.forEach(function (mem) {
            console.log('|id     :'+mem.id+'\t|');
            console.log('|type   :'+mem.type+'\t|');
            console.log('|socket_id   :'+mem.socket_id+'\t|');
        });
        console.log('======================================');
    });
}
//현재 접속 멤버 목록 삽입
function put_cur_join_member(room_code,id,join_type,total_member_list,socket_id) {
    var flag = true;
    for(var i in cur_join_state){
        if(cur_join_state[i].room_code == room_code){
            var user_ex = true;
            cur_join_state[i].cur_member_list = cur_join_state[i].cur_member_list.map(function (item) {
                if(item.id == id){
                    item.type > 1 && join_type == 2 ? item.type = item.type : item.type += join_type;
                    if(join_type == 2){
                        item.socket_id = socket_id;
                    }
                    user_ex = false;
                }
                return item;
            });

            if(user_ex){
                var json = {id:id,type:join_type};
                join_type > 1 ? json.socket_id = socket_id : '';
                cur_join_state[i].cur_member_list.push(json);//현재 접속중인 멤버에서 나를 추가함
            }
            flag = false;
            break;
        }
    }
    //cur_join_state에 없는 방이면 새로 추가
    if(flag){
        var json = {id:id,type:join_type};
        join_type > 1 ? json.socket_id = socket_id : '';
        cur_join_state.push({
            room_code: room_code,
            cur_member_list:[json],
            total_member : total_member_list
        });
    }
    console.log('===============join====================');
    showConsole();
}

//현재 접속 멤버 목록에서 삭제
function del_cur_join_state(del_target,room_code,join_type) {
    cur_join_state = cur_join_state.filter(function (item) {
        if(item.room_code == room_code){
            //접속중인 멤버가 1명일 경우 해당 인덱스 모두 삭제 (return 안하면 삭제된것)
            if(item.cur_member_list.length != 1){

                //현재 접속중인 멤버 목록에서 자신을 삭제
                item.cur_member_list = item.cur_member_list.filter(function (item2) {
                    if(item2.id == del_target && item2.type > 2){//모바일 과 웹 동시에 접속 중
                        return item2.type = 3 - join_type;
                    } else if(item2.id != del_target) {
                        return item2;
                    }
                });

                return item;
            } else if(item.cur_member_list[0].type > 2){//접속중 멤버가 1명인데 모바일 웹 모두 접속 중일 때
                return item.cur_member_list[0].type -= join_type;
            }
        } else {
            return item;
        }
    });
    console.log('==============del_after================');
    showConsole();
}

//채팅방에 현재 접속 멤버 가져오기
function get_cur_join_state(room_code) {
    var cur_member_state = {};
    var flag = true;
    for(var i in cur_join_state){
        if(cur_join_state[i].room_code == room_code){
            cur_member_state.total_member = cur_join_state[i].total_member;
            cur_member_state.cur_member_list = cur_join_state[i].cur_member_list.map(function (item) {
                return item.id;
            });
            flag = false;
            return cur_member_state;
        }
    }
    if(flag){
        return {cur_member_list : []};
    }
}

io.on('connection',function(socket){

    console.log('new Connection');

    //채팅방 입장
    socket.on('join',function (param,fn) {

        //이미 방에 접속해있으면 방 나가고 새로 접속
        if(socket.room_code !== undefined){
            socket.leave(socket.room_code);
            del_cur_join_state(socket.member_id,socket.room_code,socket.join_type);
        }
        //console.log('join_room',JSON.stringify(param));
        if(param.me && param.me !== undefined){
            chat_service.joinCheck(param).then(function (data) {
                //data -> room_code, message_list(최근메시지), member_list(채팅방 맴버), read_meg_list(내가 읽은 메시지)
                socket.room_code = data.room_code;
                socket.member_id = param.me;
                socket.join_type = param.join_type === undefined ? 1 : param.join_type;
                socket.join(data.room_code);
                put_cur_join_member(data.room_code,param.me,socket.join_type,data.member_list,socket.id);
                //자신을 제외한 나머지 맴버에게 메시지 읽음 업데이트 패킷 전송
                socket.broadcast.to(data.room_code).emit('update_meg_read',data.read_meg_list);
                //응답
                data.read_meg_list = data.read_meg_list.length;
                fn(data);
            }).catch(function (err) {
                console.log('joinERr',err);
                fn('fail');
            });
        } else {
            console.log('요청 ID undefined');
            fn('fail');
        }
    });

    //메시지 전송
    socket.on('send_message',function (param,fn) {
        console.log('send_message',JSON.stringify(param));
        var cur_room_state = get_cur_join_state(param.room_code);
        param.flag = cur_room_state.cur_member_list.join(',');
        chat_service.insertMessage(param).then(function (message_num) {
            var push_target_ids = [];
            //전체 맴버 중에서 접속중인 맴버가 아니면 push_target_ids에 id 저장
            cur_room_state.total_member.forEach(function (item) {
                if(cur_room_state.cur_member_list.indexOf(item.id) == -1){
                    push_target_ids.push(item.id);
                }
            });
            //푸시 전송
            //console.log('push_target_ids',push_target_ids);
            if(push_target_ids.length > 0){
                push.send(push_target_ids,{message:param.message,sender_name:param.name,etc:param.room_code}).then(function(data){
                    if(data.error){
                        console.log('push ERR',JSON.stringify(data));
                        push.send(push_target_ids,{message:param.message,sender_name:param.name,etc:param.room_code});
                    } else {
                        console.log('push SUCCESS',JSON.stringify(data));
                    }
                }).catch(function (err) {
                    console.log('push ERR',err);
                });
            }

            //다른 채팅방에 접속 중인 사람에게 새로운 메시지 알림 ( 웹 접속 인원중에서 )
            cur_join_state.forEach(function (item) {
                if(item.room_code != param.room_code){
                    item.cur_member_list.forEach(function (member) { //다른 채팅방의 현재 인원 중에서 ..
                        cur_room_state.total_member.forEach(function (item) { //메시지를 보내는 채팅방 전체 인원 중이서
                            if(item.id == member.id && member.type > 1){ //채팅방의 맴버이고 웹 접속이면
                                io.to(member.socket_id).emit('new_other_room_message',{
                                    message : param.message,
                                    sender : param.me,
                                    name : param.name,
                                    time : moment().format(),
                                    member_list : cur_room_state.total_member,
                                    room_code : param.room_code
                                });
                            }
                        });
                    });
                }
            });

            //메시지 전송
            io.to(param.room_code).emit('new_message',{
                message : param.message,
                sender : param.me,
                name : param.name,
                time : moment().format(),
                //flag : io.sockets.adapter.rooms[param.room_code].length,
                flag : cur_room_state.cur_member_list.length,
                num: message_num
            });
            fn({num : message_num});
            //console.log(param.room_code+' 방 인원 : '+cur_room_state.cur_member_list.length);
            //console.log(param.room_code+' 방 인원 목록 : '+param.flag);
        }).catch(function (err) {
            console.log('send_message ERR',err);
            fn('fail');
        });
    });

    //메시지 더 요청
    socket.on('more_message',function (param,fn) {
        param.me = socket.member_id;
        param.room_code = socket.room_code;
        console.log('more_message',param.last_num);
        chat_service.selectMoreMessage(param).then(function (data) {
            fn(data);
        }).catch(function (err) {
            console.log('more_message ERR',err);
            fn('fail');
        });
    });

    //메시지 읽은 사람
    socket.on('who_read_message',function (param,fn) {
        console.log('who_read_message',param.num);
        chat_service.selectWhoReadMessage(param).then(function (data) {
            fn(data);
        }).catch(function (err) {
            console.log('who_read_message ERR',err);
            fn('fail');
        });
    });

    //현재 방에 접속 중인 사람
    socket.on('cur_member_list',function (param,fn) {
        console.log('cur_member_list',param.room_code);
        fn(get_cur_join_state(param.room_code).cur_member_list);
    });

    //초대 하기
    socket.on('invite_member',function (param,fn) {
        console.log('invite_member',JSON.stringify(param));
        if(param.ids.length > 0){
            chat_service.inviteRoom(param).then(function (message_num) {
                fn('success');
                for(var i in cur_join_state){
                    if(cur_join_state[i].room_code == param.room_code){
                        for(var i in param.ids){
                            cur_join_state[i].total_member.push({id:param.ids[i],name:param.names[i],start_num:message_num});
                        }
                    }
                }
                io.to(param.room_code).emit('invite_member',{
                    ids : param.ids,
                    names : param.names
                });
                io.to(param.room_code).emit('new_message',{
                    message : param.message,
                    sender : 'system',
                    time : moment().format(),
                    flag : 'system',
                    num: message_num
                });
            }).catch(function (err) {
                console.log('invite_member ERR',err);
                fn('fail');
            });
        } else {
            console.log('invite_member ERR\n 초대 대상 id가 없음');
            fn('fail');
        }
    });

    //방 나감
    socket.on('leave_room',function (param,fn) {
        console.log('leave_room',socket.room_code);
        param.room_code = socket.room_code;
        param.id = socket.member_id;
        param.message = param.me_name+'님이 채팅방을 나갔습니다.';
        chat_service.leaveRoom(param).then(function (message_num) {
            fn('success');
            io.to(param.room_code).emit('new_message',{
                message : param.message,
                sender : 'system',
                time : moment().format(),
                flag : 'system',
                num: message_num
            });
            io.to(param.room_code).emit('who_leave_room',{
               id : socket.member_id
            });
            del_cur_join_state(socket.member_id,socket.room_code,socket.join_type);
            socket.leave(socket.room_code);
        }).catch(function (err) {
            console.log('leave_room ERR',err);
            fn({err:err});
        });
    });

    //뱃지 업데이트
    socket.on('update_badge',function (param) {
        console.log('update_badge');
        param.me = socket.member_id;
        chat_service.updateBadge(param);
    });

    //접속 종료
    socket.on('disconnect', function(){
        //console.log('disconnect',socket.room_code);
        del_cur_join_state(socket.member_id,socket.room_code,socket.join_type);
        socket.leave(socket.room_code);
    });

});