import hmacSHA256 from 'crypto-js/hmac-sha256'
import md5 from 'crypto-js/md5'
import axios from "axios";

// 创建axios实例
const request = axios.create({
    baseURL: '',
    timeout: 150000, // 请求超时时间
});

// 响应拦截器
request.interceptors.response.use(
    response => {
        // 请求成功处理
        return response;
    },
    error => {
        // 请求失败处理
        // console.error('Error:', error);
        return Promise.reject(error);
    }
);


const host = "https://zonai.skland.com";
// const playerInfoAPI = '/api/v1/game/player/info'
// const playerBindingAPI = '/api/v1/game/player/binding'


function getSign(path, requestParam, secret) {
    const timestamp = Math.floor(new Date().getTime() / 1000 - 1).toString();

    const headers = {
        platform: '3',
        timestamp: timestamp,
        dId: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0',
        vName: '1.2.0'
    }
    requestParam = requestParam ? requestParam : ''
    let message = path + requestParam + timestamp + JSON.stringify(headers);
    console.log('message', message);
    const sign = md5(hmacSHA256(message, secret).toString()).toString()
    console.log('sign', sign)
    return { timestamp, sign }
}


async function getPlayBinding(path, requestParam, secret, cred) {

    cred = cred.replace(/\s+/g, '')
    cred = cred.replace(/["']/g, '')

    secret = secret.replace(/\s+/g, '')
    secret = secret.replace(/["']/g, '')

    const { timestamp, sign } = getSign(path, requestParam, secret);

    let uid = void 0
    let nickName = ""
    let server = 1

    const url = `${host}${path}`
    const headers = {
        "platform": '3',
        "timestamp": timestamp,
        "dId": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0',
        "vName": '1.2.0',
        "cred": cred,
        "sign": sign
    }

    let bindingData = {
        bindingList: [],
        uid: uid,
        nickName: nickName,
        server:server,
    }



    await request({
        url: url,
        headers: headers,
        method: "get",
    }).then(response => {
        console.log(response)
        response = response.data
        console.log(response, response.code)
        if (response.code !== 0) {

        } else {
            const list = response.data.list

            let bindingList = []

            for (const item of list) {
                if (item.appCode === 'arknights') {
                    bindingList = item.bindingList
                    break
                }
            }

            for (const binding of bindingList) {
                if (binding.isOfficial) {
                    uid = binding.uid;
                    nickName = binding.nickName;
                    server = binding.channelMasterId;
                }
            }

            if (typeof uid === "undefined") {
                uid = list[0].bindingList[0].uid;
                nickName = list[0].bindingList[0].nickName;
                server = list[0].bindingList[0].channelMasterId;
            }

            bindingData.bindingList = bindingList;
            bindingData.nickName = nickName;
            bindingData.uid = uid;
            bindingData.server = server;

        }
    }).catch(error => {
        window.$message.error("森空岛CRED错误或失效")
    })
    return bindingData;
}

async function getPlayerInfo(path, requestParam, secret, cred, uid, nickName) {

    const { timestamp, sign } = getSign(path, requestParam, secret);
    const url = `${host}${path}?${requestParam}`
    // console.log(url)
    const headers = {
        "platform": '3',
        "timestamp": timestamp,
        "dId": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0',
        "vName": '1.2.0',
        "cred": cred,
        "sign": sign
    }

    let resultData = {}

    await request({
        url: url,
        headers: headers,
        method: "get",
    }).then(response => {
        response = response.data
        const data = response.data
        const chars = data.chars;
        const charInfoMap = data.charInfoMap;
        const equipmentInfoMap = data.equipmentInfoMap;
        const nickName = data.status.name;
        const avatar = data.status.avatar;
        const level = data.status.level;
        resultData = {
            nickName,
            avatar,
            level,
            uid,
            chars,
            charInfoMap,
            equipmentInfoMap
        }
    }).catch(error => {
        window.$message.error("读取森空岛数据失败")
    })

    return resultData

}

export default {
    getPlayBinding,
    getPlayerInfo,
}