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
