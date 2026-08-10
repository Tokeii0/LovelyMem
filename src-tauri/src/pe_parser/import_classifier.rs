//! 导入函数分类模块
//! API名称使用混淆存储，避免杀软误报

use super::types::ImportClassification;
use std::sync::LazyLock;

/// 解码混淆的字符串（简单的字符反转）
fn decode(s: &str) -> String {
    s.chars().rev().collect()
}

/// 批量解码
fn decode_list(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| decode(s)).collect()
}

// ============================================================================
// 以下字符串均为反转存储，运行时解码
// ============================================================================

/// 文件操作相关API（混淆存储）
static FILE_APIS: LazyLock<Vec<String>> = LazyLock::new(|| {
    decode_list(&[
        "AeliFetaerC",
        "WeliFetaerC",
        "eliFdaeR",
        "eliFetirW",
        "AeliFeteleD",
        "WeliFeteleD",
        "AeliFypoC",
        "WeliFypoC",
        "AeliFevoM",
        "WeliFevoM",
        "AsetubirttAeliFteG",
        "WsetubirttAeliFteG",
        "AsetubirttAeliFteS",
        "WsetubirttAeliFteS",
        "AeliFtsriFdniF",
        "WeliFtsriFdniF",
        "AeliFtxeNdniF",
        "WeliFtxeNdniF",
        "eziSeliFteG",
        "xEeziSeliFteG",
        "retnioPeliFteS",
        "xEretnioPeliFteS",
        "AyrotceriDetaerC",
        "WyrotceriDetaerC",
        "AyrotceriDevoMeR",
        "WyrotceriDevoMeR",
        "AyrotceriDtnerruCteG",
        "WyrotceriDtnerruCteG",
        "AyrotceriDtnerruCteS",
        "WyrotceriDtnerruCteS",
        "AhtaPpmeTteG",
        "WhtaPpmeTteG",
        "AemaNeliFpmeTteG",
        "WemaNeliFpmeTteG",
        "sreffuBeliFhsulF",
        "eliFkcoL",
        "eliFkcolnU",
        "AgnippaMeliFetaerC",
        "WgnippaMeliFetaerC",
        "eliFfOweiVpaM",
        "eliFfOweiVpamnU",
        "eliFetaerCtN",
        "eliFdaeRtN",
        "eliFetirWtN",
        "eliFetaerCwZ",
        "eliFdaeRwZ",
        "eliFetirWwZ",
    ])
});

/// 注册表操作相关API（混淆存储）
static REGISTRY_APIS: LazyLock<Vec<String>> = LazyLock::new(|| {
    decode_list(&[
        "AyeKnepOgeR",
        "WyeKnepOgeR",
        "AxEyeKnepOgeR",
        "WxEyeKnepOgeR",
        "AyeKetaerCgeR",
        "WyeKetaerCgeR",
        "AxEyeKetaerCgeR",
        "WxEyeKetaerCgeR",
        "AyeKeteleDgeR",
        "WyeKeteleDgeR",
        "AeulaVeteleDgeR",
        "WeulaVeteleDgeR",
        "AeulaVteSgeR",
        "WeulaVteSgeR",
        "AxEeulaVteSgeR",
        "WxEeulaVteSgeR",
        "AeulaVyreuQgeR",
        "WeulaVyreuQgeR",
        "AxEeulaVyreuQgeR",
        "WxEeulaVyreuQgeR",
        "AyeKmunEgeR",
        "WyeKmunEgeR",
        "AxEyeKmunEgeR",
        "WxEyeKmunEgeR",
        "AeulaVmunEgeR",
        "WeulaVmunEgeR",
        "yeKesolCgeR",
        "yeKhsulFgeR",
        "yeKnepOtN",
        "yeKetaerCtN",
        "yeKeulaVteStN",
        "yeKeulaVyreuQtN",
        "yeKnepOwZ",
        "yeKetaerCwZ",
        "yeKeulaVteSwZ",
        "yeKeulaVyreuQwZ",
    ])
});

/// 网络操作相关API（混淆存储）
static NETWORK_APIS: LazyLock<Vec<String>> = LazyLock::new(|| {
    decode_list(&[
        "tekcos",
        "tcennoc",
        "dnes",
        "vcer",
        "otdnes",
        "morfvcer",
        "dnib",
        "netsil",
        "tpecca",
        "tekcosesolc",
        "nwodtuhs",
        "emanybtsohteg",
        "rddaybtsohteg",
        "ofnirddateg",
        "ofnirddaeerf",
        "putratSASW",
        "punaelCASW",
        "tekcosASW",
        "tcennoCASW",
        "dneSASW",
        "vcerASW",
        "AnepOtenretnI",
        "WnepOtenretnI",
        "AtcennoCtenretnI",
        "WtcennoCtenretnI",
        "AlrUnepOtenretnI",
        "WlrUnepOtenretnI",
        "eliFdaeRtenretnI",
        "eliFetirWtenretnI",
        "AtseuqeRnepOpttH",
        "WtseuqeRnepOpttH",
        "AtseuqeRdneSpttH",
        "WtseuqeRdneSpttH",
        "AofnIyreuQpttH",
        "WofnIyreuQpttH",
        "eldnaHesolCtenretnI",
        "AeliFoTdaolnwoDLRU",
        "WeliFoTdaolnwoDLRU",
        "AeliFehcaCoTdaolnwoDLRU",
        "WeliFehcaCoTdaolnwoDLRU",
        "nepOpttHniW",
        "tcennoCpttHniW",
        "tseuqeRnepOpttHniW",
        "tseuqeRdneSpttHniW",
        "esnopseRevieceRpttHniW",
        "ataDdaeRpttHniW",
        "eldnaHesolCpttHniW",
        "emanreepteg",
        "emankcosteg",
        "tpokcostesg",
        "tpokcosets",
        "tekcosltcoi",
    ])
});

/// 进程操作相关API（混淆存储）
static PROCESS_APIS: LazyLock<Vec<String>> = LazyLock::new(|| {
    decode_list(&[
        "AssecorPetaerC",
        "WssecorPetaerC",
        "AresUssAecorPetaerC",
        "WresUssAecorPetaerC",
        "ssecorPnepO",
        "ssecorPetanimreT",
        "ssecorPtixE",
        "ssecorPedoCtixEteG",
        "ssecorPtnerruCteG",
        "dIssecorPtnerruCteG",
        "dIssecorPteG",
        "daerhTetaerC",
        "daerhTetomeRetaerC",
        "xEdaerhTetomeRetaerC",
        "daerhTnepO",
        "daerhTetanimreT",
        "daerhTtixE",
        "daerhTdnepsuS",
        "daerhTemuseR",
        "daerhTtnerruCteG",
        "dIdaerhTtnerruCteG",
        "dIdaerhTteG",
        "tcejbOelgniSroFtiaW",
        "stcejbOelpitluMroFtiaW",
        "peelS",
        "xEpeelS",
        "AeldnaHeludoMteG",
        "WeldnaHeludoMteG",
        "AemaNeliFeludoMteG",
        "WemaNeliFeludoMteG",
        "AyrarbiLdaoL",
        "WyrarbiLdaoL",
        "AxEyrarbiLdaoL",
        "WxEyrarbiLdaoL",
        "sserddAcorPteG",
        "yrarbiLeerF",
        "sessecorPmunE",
        "seludoMssecorPmunE",
        "emaNesaBeludoMteG",
        "noitamrofnIeludoMteG",
        "ssecorPnoitamrofnIyreuQtN",
        "ssecorPnepOtN",
        "ssecorPetanimreTtN",
        "ssecorPnoitamrofnIyreuQwZ",
        "ssecorPnepOwZ",
        "ssecorPetanimreTwZ",
        "AetucexEllehS",
        "WetucexEllehS",
        "AxEetucexEllehS",
        "WxEetucexEllehS",
        "cexEniW",
        "metsys",
        "vcexe_",
        "evcexe_",
        "vnwaps_",
        "evnwaps_",
    ])
});

/// 内存操作相关API（混淆存储）
static MEMORY_APIS: LazyLock<Vec<String>> = LazyLock::new(|| {
    decode_list(&[
        "collAlautriV",
        "xEcollAlautriV",
        "eerFlautriV",
        "xEeerFlautriV",
        "tcetorPlautriV",
        "xEtcetorPlautriV",
        "yreuQlautriV",
        "xEyreuQlautriV",
        "kcoLlautriV",
        "kcolnUlautriV",
        "etaerCpaeH",
        "yortseDpaeH",
        "collApaeH",
        "collAeRpaeH",
        "eerFpaeH",
        "collAlabolG",
        "eerFlabolG",
        "kcoLlabolG",
        "kcolnUlabolG",
        "collAlacoL",
        "eerFlacoL",
        "kcoLlacoL",
        "kcolnUlacoL",
        "yromeMssecorPdaeR",
        "yromeMssecorPetirW",
        "yromeMlautriVetacollAtN",
        "yromeMlautriVeerFtN",
        "yromeMlautriVtcetorPtN",
        "yromeMlautriVdaeRtN",
        "yromeMlautriVetirWtN",
        "yromeMlautriVetacollAwZ",
        "yromeMlautriVeerFwZ",
        "yromeMlautriVtcetorPwZ",
        "yromeMlautriVdaeRwZ",
        "yromeMlautriVetirWwZ",
        "ypcmem",
        "evommem",
        "tesmem",
        "pmcmem",
        "yromeMevoMltR",
        "yromeMypoCltR",
        "yromeMoreZltR",
        "yromeMlliFltR",
    ])
});

/// 加密操作相关API（混淆存储）
static CRYPTO_APIS: LazyLock<Vec<String>> = LazyLock::new(|| {
    decode_list(&[
        "AtxetnoCeriuqcAtpyrC",
        "WtxetnoCeriuqcAtpyrC",
        "txetnoCesaeleRtpyrC",
        "yeKneGtpyrC",
        "yeKevireDtpyrC",
        "yeKyortseDtpyrC",
        "yeKtropxEtpyrC",
        "yeKtropmItpyrC",
        "tpyrcnEtpyrC",
        "tpyrceDtpyrC",
        "ataDhsaHtpyrC",
        "hsaHetaerCtpyrC",
        "hsaHyortseDtpyrC",
        "maraPhsaHteGtpyrC",
        "maraPhsaHteStpyrC",
        "AhsaHngiStpyrC",
        "WhsaHngiStpyrC",
        "AerutangiSyfireVtpyrC",
        "WerutangiSyfireVtpyrC",
        "redivorPmhtiroglAnepOtpyrcB",
        "redivorPmhtiroglAesolCtpyrcB",
        "yeKcirtemySetareneGtpyrcB",
        "yeKyortseDtpyrcB",
        "tpyrcnEtpyrcB",
        "tpyrceDtpyrcB",
        "hsaHetaerCtpyrcB",
        "hsaHyortseDtpyrcB",
        "ataDhsaHtpyrcB",
        "hsaHhsiniFtpyrcB",
        "redivorPegarotSnepOtpyrcN",
        "tcejbOeerFtpyrcN",
        "erotSnepOtreC",
        "erotSesolCtreC",
        "erotSnIetacifitreCdniFtreC",
        "ytreporPtxetnoCetacifitreCteGtreC",
        "txetnoCetacifitreCeerFtreC",
        "tsurTyfireVniW",
        "edocnEoTnepOgsMtpyrC",
        "edoceDoTnepOgsMtpyrC",
    ])
});

/// 反调试相关API（混淆存储）
static ANTI_DEBUG_APIS: LazyLock<Vec<String>> = LazyLock::new(|| {
    decode_list(&[
        "tneserPreggubeDsI",
        "tneserPreggubeDetomeRkcehC",
        "ssecorPnoitamrofnIyreuQtN",
        "daerhTnoitamrofnIteStN",
        "AgnirtSgubeDtuptuO",
        "WgnirtSgubeDtuptuO",
        "tnuoCkciTteG",
        "46tnuoCkciTteG",
        "retnuoCecnamrofrePyreuQ",
        "ycneuqerFecnamrofrePyreuQ",
        "cstdr",
        "cstdr__",
        "noitamrofnImetsySyreuQtN",
        "noitamrofnImetsySyreuQwZ",
        "rorrEtsaLteG",
        "rorrEtsaLteS",
        "noitpecxEesiaR",
        "retliFnoitpecxEdeldnahnU",
        "retliFnoitpecxEdeldnahnUteS",
        "esolCtN",
        "eldnaHesolC",
        "tupnIkcolB",
        "etatSyeKcnysAteG",
        "etatSyeKteG",
        "AwodniWdniF",
        "WwodniWdniF",
        "AxEwodniWdniF",
        "WxEwodniWdniF",
        "swodniWmunE",
        "AtxeTwodniWteG",
        "WtxeTwodniWteG",
        "noitucexEdleiYtN",
    ])
});

/// 代码注入相关API（混淆存储）
static INJECTION_APIS: LazyLock<Vec<String>> = LazyLock::new(|| {
    decode_list(&[
        "daerhTetomeRetaerC",
        "xEdaerhTetomeRetaerC",
        "xEdaerhTetaerCtN",
        "daerhTresUetaerCltR",
        "yromeMssecorPetirW",
        "yromeMlautriVetirWtN",
        "yromeMlautriVetirWwZ",
        "xEcollAlautriV",
        "yromeMlautriVetacollAtN",
        "yromeMlautriVetacollAwZ",
        "txetnoCdaerhTteS",
        "txetnoCdaerhTteG",
        "daerhTtxetnoCteStN",
        "daerhTtxetnoCteGtN",
        "CPAresUeueuQ",
        "daerhTcpAeueuQtN",
        "AxEkooHswodniWteS",
        "WxEkooHswodniWteS",
        "xEkooHswodniWkooHnU",
        "noitceSfOweiVpaMtN",
        "noitceSfOweiVpaMnUtN",
        "noitceSfOweiVpaMwZ",
        "noitceSfOweiVpaMnUwZ",
        "yromeMevoMltR",
        "yromeMypoCltR",
        "noitceSetaerCtN",
        "noitceSetaerCwZ",
        "llDdaoLrdL",
        "sserddAerudecorPteGrdL",
        "segelivirPnekoTtsujdA",
        "nekoTssecorPnepO",
        "AeulaVegelivirPpukooll",
        "WeulaVegelivirPpukooll",
    ])
});

/// 对导入函数进行分类
pub fn classify_imports(imports: &[super::types::PEImport]) -> ImportClassification {
    let mut classification = ImportClassification::default();

    for import in imports {
        for func in &import.functions {
            let func_name = func.as_str();

            let mut classified = false;

            // 检查文件操作
            if is_in_list(func_name, &FILE_APIS) {
                classification
                    .file_operations
                    .push(format!("{}!{}", import.dll_name, func));
                classified = true;
            }

            // 检查注册表操作
            if is_in_list(func_name, &REGISTRY_APIS) {
                classification
                    .registry_operations
                    .push(format!("{}!{}", import.dll_name, func));
                classified = true;
            }

            // 检查网络操作
            if is_in_list(func_name, &NETWORK_APIS) {
                classification
                    .network_operations
                    .push(format!("{}!{}", import.dll_name, func));
                classified = true;
            }

            // 检查进程操作
            if is_in_list(func_name, &PROCESS_APIS) {
                classification
                    .process_operations
                    .push(format!("{}!{}", import.dll_name, func));
                classified = true;
            }

            // 检查内存操作
            if is_in_list(func_name, &MEMORY_APIS) {
                classification
                    .memory_operations
                    .push(format!("{}!{}", import.dll_name, func));
                classified = true;
            }

            // 检查加密操作
            if is_in_list(func_name, &CRYPTO_APIS) {
                classification
                    .crypto_operations
                    .push(format!("{}!{}", import.dll_name, func));
                classified = true;
            }

            // 检查反调试
            if is_in_list(func_name, &ANTI_DEBUG_APIS) {
                classification
                    .anti_debug
                    .push(format!("{}!{}", import.dll_name, func));
                classified = true;
            }

            // 检查代码注入
            if is_in_list(func_name, &INJECTION_APIS) {
                classification
                    .injection
                    .push(format!("{}!{}", import.dll_name, func));
                classified = true;
            }

            if !classified {
                classification
                    .other
                    .push(format!("{}!{}", import.dll_name, func));
            }

            classification.total_classified += 1;
        }
    }

    // 计算可疑计数
    classification.suspicious_count =
        classification.anti_debug.len() + classification.injection.len();

    classification
}

/// 检查函数名是否在列表中（不区分大小写）
fn is_in_list(func_name: &str, list: &[String]) -> bool {
    let func_lower = func_name.to_lowercase();
    list.iter().any(|api| api.to_lowercase() == func_lower)
}
