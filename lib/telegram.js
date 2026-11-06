'use strict';
const { riskStatus } = require('./logic');
async function notifyTelegram(record, events) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  // Semua event TEST diberi label simulasi, tidak pernah menyamar menjadi kejadian nyata.
  const event = events.find(x => x.type === 'STATUS_CHANGE' || x.type === 'INITIAL');
  if (!event) return;
  const isTest = record.mode === 'SIMULASI';
  const danger = riskStatus(record.system_status);
  const simulatedAlarm = isTest && record.system_status.startsWith('TEST') && record.system_status !== 'TEST NORMAL';
  const recovered = ['NORMAL', 'TEST NORMAL'].includes(record.system_status) && event.from_status && !['NORMAL', 'TEST NORMAL'].includes(event.from_status);
  if (!danger && !simulatedAlarm && !recovered) return;
  const label = recovered ? (isTest ? '🧪 SIMULASI KEMBALI NORMAL' : '✅ STATUS NORMAL KEMBALI') : isTest ? '🧪 SIMULASI BAHAYA' : '🚨 BAHAYA SENSOR';
  const msg = [label, `Perangkat: ${record.device_id}`, `Status: ${record.system_status}`, `Mode: ${record.mode}`, `Suhu: ${record.temperature_c ?? 'ERROR'} °C`, `Kelembapan: ${record.humidity_pct ?? 'ERROR'} %`, `MQ-2: ${record.mq2_status === 'READY' ? record.mq2_adc + ' ADC' : record.mq2_status}`, `Servo diperintah: ${record.servo_target_deg}°`, `Buzzer: ${record.buzzer_on ? 'ON' : 'OFF'}`].join('\n');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: msg }), signal: controller.signal
    });
    if (!response.ok) {
      const errorData = await response.json();

      console.error(
        "Notifikasi Telegram gagal HTTP",
        response.status
      );

      console.error(
        "Penyebab:",
        errorData.description
      );
    }
  } catch (e) { console.error('Notifikasi Telegram gagal:', e.message); } finally { clearTimeout(timeout); }
}
module.exports = { notifyTelegram };
