function charAvatar(skinId){
    if(skinId.includes('@')){
        skinId = skinId.replace(/@/g,'_')
        skinId = encodeURIComponent(skinId)
    }else{
        skinId = skinId.replace(/#/g,'_')
    }
    return `https://torappu.prts.wiki/assets/char_avatar/${skinId}.png`
}

function docAvatar(id){
    return `https://torappu.prts.wiki/assets/player_avatar/${id}.png`
}

function portrait(skinId){
    skinId = skinId.toLowerCase()
    if(skinId.includes('@')){
        skinId = skinId.replace(/@/g,'_')
        skinId = encodeURIComponent(skinId)
    }else{
        skinId = skinId.replace(/#/g,'_')
    }
    return `https://torappu.prts.wiki/assets/char_portrait/${skinId}.png`
}

function potential(rank){
    return `https://torappu.prts.wiki/assets/potential_icon/potential_${rank}.png`
}

function elite(rank){
    return `https://torappu.prts.wiki/assets/elite_icon/elite_${rank}_large.png`
}

function profession(pro){
    pro = pro.toLowerCase()
    return `https://torappu.prts.wiki/assets/profession_large_icon/icon_profession_${pro}_large.png`
}

function starYellow(rarity){
    return `https://torappu.prts.wiki/assets/rarity_icon/rarity_yellow_${rarity}.png`
}

function starWhite(rarity){
    return `https://torappu.prts.wiki/assets/rarity_icon/rarity_${rarity}.png`
}

function skill(skillId){
    if(skillId){
        //森空岛强力击系列技能有错误，特判
        var arr1 = ['skchr_stward_1']
        var arr2 = ['skchr_savage_1','skchr_doberm_1','skchr_bryota_1','skchr_jesica_1','skchr_caper_1']
        var arr3 = ['skchr_lessng_1','skchr_huang_1','skchr_svrash_1']
        if(arr1.includes(skillId)){
            skillId = 'skcom_powerstrike[1]'
        }else if(arr2.includes(skillId)){
            skillId = 'skcom_powerstrike[2]'
        }else if(arr3.includes(skillId)){
            skillId = 'skcom_powerstrike[3]'
        }
        if(skillId == 'skchr_vigna_1'){
            skillId = 'skcom_atk_up[2]'
        }else if(skillId == 'skchr_midn_1'){
            skillId = 'skcom_enchant[1]'
        }else if(skillId == 'skchr_catap_1'){
            skillId = 'skcom_blowrange_up[1]'
        }
        return `https://torappu.prts.wiki/assets/skill_icon/skill_icon_${skillId}.png`
    }else{
        return 'https://media.prts.wiki/0/03/Skill_icon_none.png'
    }
}

function specialized(skills,skillId){
    let index = skills.findIndex(e => e.id == skillId)
    let sp = skills[index].specializeLevel
    return `https://torappu.prts.wiki/assets/specialized_icon/specialized_tiny_${sp}.png`
}

function equip(eq){
    return `https://torappu.prts.wiki/assets/uniequip_direction/${eq}.png`
}

function server(id){
    if(id == 1){
        return 'https://static.prts.wiki/charinfo/img/skland/yj.png'
    }else if(id == 2){
        return 'https://static.prts.wiki/charinfo/img/skland/bili.png'
    }
}

export default {
    charAvatar,
    docAvatar,
    portrait,
    potential,
    elite,
    profession,
    starYellow,
    starWhite,
    skill,
    specialized,
    equip,
    server
}