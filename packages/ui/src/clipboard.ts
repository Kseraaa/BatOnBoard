/**
 * คัดลอกข้อความลง clipboard — ใช้ Clipboard API ก่อน ถ้าถูกบล็อก
 * (เช่น in-app browser ของ LINE หรือ webview บางตัว) ลองวิธีเก่าด้วย textarea ซ่อน
 * คืน false ถ้าไม่สำเร็จทั้งคู่ ให้ผู้เรียกแสดงข้อความให้ผู้ใช้คัดลอกเอง
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // ลองวิธีถัดไป
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    // execCommand เลิกแนะนำแล้ว แต่เป็นทางเดียวใน webview ที่ไม่มี Clipboard API
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch {
    return false;
  }
}
