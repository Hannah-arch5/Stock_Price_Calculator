/**
 * Ticker - Google Drive 专属同步脚本 (Google Apps Script)
 * 
 * 部署指引：
 * 1. 在电脑浏览器中打开：https://script.google.com/
 * 2. 点击左上角「新项目」或「+ 创建新项目」。
 * 3. 删掉编辑器里默认的代码，将本文件的全部代码复制粘贴进去，按 Cmd + S 保存。
 * 4. 点击右上角蓝色的「部署」(Deploy) -> 选择「新建部署」(New deployment)。
 * 5. 在弹出的齿轮图标旁边选择类型为「网页应用」(Web app)：
 *    - 说明 (Description)：Ticker Sync
 *    - 执行身份 (Execute as)：我的帐号 (Me)
 *    - 谁可以访问 (Who has access)：所有人 (Anyone)  <-- 必须选这项，手机才能免登同步
 * 6. 点击「部署」，首次部署 Google 会提示授权，点击「查看权限」-> 选择你的 Google 帐号 -> 
 *    点击「高级 (Advanced)」-> 点击「转到未命名的项目 (安全)」-> 点击「允许」。
 * 7. 复制生成的「网页应用网址」(以 https://script.google.com/macros/s/.../exec 结尾)。
 * 8. 把该网址填入 Ticker 电脑端设置中，两台手机出门连 5G 就能自动毫秒级云同步！
 */

const FILE_NAME = "ticker-data.json";

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === "quote") {
      return getStockQuote_(e.parameter.symbol || "");
    }
    const files = DriveApp.getFilesByName(FILE_NAME);
    let content = '{"historyRecords":[],"customLabels":[]}';
    if (files.hasNext()) {
      const file = files.next();
      content = file.getBlob().getDataAsString();
    }
    return ContentService.createTextOutput(content)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 手机网页行情代理。只转发已校验的 A 股 / 港股证券代码，绝不读取持仓价格代替行情。
 */
function getStockQuote_(rawSymbol) {
  try {
    const input = String(rawSymbol || "").trim().toUpperCase();
    let rawCode = "";
    let secid = "";
    let match = input.match(/^(?:(SH|SZ|BJ))?(\d{6})(?:\.(SH|SS|SZ|BJ))?$/);
    if (match) {
      rawCode = match[2];
      const inferred = rawCode.indexOf("6") === 0 ? "SH" : /^[489]/.test(rawCode) ? "BJ" : "SZ";
      const explicit = (match[1] || match[3] || inferred).replace("SS", "SH");
      if (explicit !== inferred) throw new Error("股票代码与交易所不匹配");
      secid = (explicit === "SH" ? "1." : "0.") + rawCode;
    } else {
      match = input.match(/^(?:HK)?(\d{5})$/) || input.match(/^(\d{1,5})\.HK$/);
      if (!match) throw new Error("仅支持 A 股或港股证券代码");
      rawCode = ("00000" + match[1]).slice(-5);
      secid = "116." + rawCode;
    }

    const fields = "f57,f58,f43,f170,f59,f86";
    const url = "https://push2.eastmoney.com/api/qt/stock/get?secid=" + encodeURIComponent(secid) +
      "&fltt=2&invt=2&fields=" + encodeURIComponent(fields) + "&_=" + Date.now();
    const response = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://quote.eastmoney.com/" }
    });
    if (response.getResponseCode() !== 200) throw new Error("行情服务返回 HTTP " + response.getResponseCode());
    const payload = JSON.parse(response.getContentText("UTF-8"));
    const data = payload && payload.data;
    if (!data || String(data.f57) !== rawCode || !isFinite(Number(data.f43)) || Number(data.f43) <= 0 ||
        !isFinite(Number(data.f86)) || Number(data.f86) <= 0) {
      throw new Error("行情响应无效");
    }
    return jsonOutput_({ rc: 0, data: {
      f57: String(data.f57), f58: String(data.f58 || ""), f43: Number(data.f43),
      f170: data.f170 == null || data.f170 === "-" ? null : Number(data.f170),
      f59: Number(data.f59), f86: Number(data.f86)
    }});
  } catch (err) {
    return jsonOutput_({ rc: 1, error: err.toString() });
  }
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const postData = e.postData && e.postData.contents;
    if (!postData) {
      throw new Error("No payload received");
    }
    
    // 简单校验是否为合法 JSON
    JSON.parse(postData);

    const files = DriveApp.getFilesByName(FILE_NAME);
    if (files.hasNext()) {
      const file = files.next();
      file.setContent(postData);
    } else {
      DriveApp.createFile(FILE_NAME, postData, "application/json");
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, updated: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 目标价邮件提醒通道（通过 Google Apps Script 原生 MailApp 发送）
 */
function sendPriceAlertEmail(symbol, name, targetPrice, currentPrice, note) {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    if (!userEmail) return;
    const subject = `【Ticker 目标价提醒】${symbol} ${name || ''} 已达到目标价 ${targetPrice}`;
    const body = `你的股票已达到目标价：\n\n• 股票代码：${symbol} (${name || ''})\n• 目标价位：${targetPrice}\n• 现价监控：${currentPrice || '已触发'}\n• 操盘备忘：${note || '无'}\n\n通知时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n—— Ticker Studio Noir`;
    MailApp.sendEmail(userEmail, subject, body);
  } catch (e) {
    console.error("Send alert email error:", e);
  }
}
