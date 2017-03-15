/**
 * Created by jungpark on 2016. 12. 9..
 */
var request = require('request');
var P = require("bluebird");
var url = 'http://';//요청 주소
var checkParamList = ['message','sender_name','ids','etc'];//파라미터값 검사 항목
var access_code = '';
//http request 요청 함수
function req(form) {
    return new P(function (resolve, reject) {
        form.token = access_code;
        request.post({url:url,form:form},function(err,httpResponse,body){
            if(err){
                reject(err);
            } else {
                resolve(body);
            }
        });
    });
}

module.exports = {

    send: function (ids, message_info) {
        return new P(function (resolve, reject) {
            if (typeof ids === 'string' && ids == '') {
                reject('ids is empty');
            }

            if (Array.isArray(ids) && ids.length == 0) {
                reject('ids is empty');
            }

            message_info.type = 'chat';
            message_info.ids = ids;

            for (var i in checkParamList) {
                if (!message_info[checkParamList[i]]) {
                    reject(checkParamList[i] + ' is undefined');
                    break;
                }
            }

            req(message_info).then(function (res) {
                resolve(res);
            }).catch(function (err) {//http요청 실패 시
                reject(err);
                // //1초후 재요청
                // setTimeout(function(){
                //     req(message_info).then(function(res){
                //         resolve(res);
                //     }).catch(function(err){
                //
                //     });
                // }, 1000);
            });
        });
    }
}