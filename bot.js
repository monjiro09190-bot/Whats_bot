const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenAI } = require('@google/genai');
const { Telegraf } = require('telegraf');
const pdf = require('pdf-parse');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const ADMIN_TELEGRAM_ID = process.env.ADMIN_ID; 

let courseKnowledgeBase = ""; 
let botCreatorInfo = "مطور هذا البوت طالب جامعي ذكي ومجتهد."; 
let activeWaClient = null; 

// دالة لإنشاء وتشغيل بوت واتساب للرقم المحدد عبر تليجرام
function startWhatsAppClient(sessionName = 'default-session') {
    if (activeWaClient) {
        try { activeWaClient.destroy(); } catch (e) {}
    }

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionName }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    // إرسال كود الاقتران عبر تليجرام فور توليده
    client.on('code', async (code) => {
        if (ADMIN_TELEGRAM_ID) {
            await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `🔑 **كود الاقتران الجديد للواتساب:**\n\`${code}\`\n\nانسخه وأدخله في واتساب هاتفك (الأجهزة المرتبطة -> ربط برقم الهاتف).`, { parse_mode: 'Markdown' });
        }
    });

    client.on('ready', () => {
        console.log('✅ تم ربط بوت الواتساب بنجاح!');
        if (ADMIN_TELEGRAM_ID) {
            bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, '✅ بوت الواتساب متصل بنجاح وجاهز لخدمة مجموعة الجامعة!');
        }
    });

    // استقبال رسائل الأسئلة في مجموعات واتساب
    client.on('message', async (msg) => {
        if (msg.body.startsWith('!ai') || msg.body.includes('@bot')) {
            const userPrompt = msg.body.replace('!ai', '').replace('@bot', '').trim();
            if (!userPrompt) return msg.reply('💡 اكتب سؤالك بعد الأمر !ai\nمثال: !ai اشرح لي المحاضرة الأولى');

            try {
                const fullPrompt = `
معلومات صانع البوت: ${botCreatorInfo}
محتوى المقرر الدراسي المعتمدة:
${courseKnowledgeBase}

أجب عن سؤال الطالب التالي بأسلوب أكاديمي مبسط ومشجع:
السؤال: ${userPrompt}
                `;

                const response = await ai.models.generateContent({
                    model: 'gemini-1.5-flash',
                    contents: fullPrompt,
                });

                msg.reply(response.text);
            } catch (error) {
                msg.reply('⚠️ عذراً، حدث خطأ أثناء الاتصال بالمساعد الذكي.');
            }
        }
    });

    client.initialize();
    activeWaClient = client;
}

// ==========================================
// 🤖 أوامر تليجرام (لوحة التحكم الشاملة)
// ==========================================

bot.start((ctx) => {
    if (ctx.from.id.toString() !== ADMIN_TELEGRAM_ID) return ctx.reply('⛔ هذا البوت مخصص لمدير النظام فقط.');
    ctx.reply('👋 أهلاً بك في لوحة تحكم بوت الجامعة!\n\nالأوامر المتاحة:\n📱 `/connect <رقم الهاتف>` - ربط رقم جديد أو تغيير الرقم المحظور (مثال: `/connect 249912345678`)\n📚 أرسل أي ملف PDF هنا مباشرة لتحديث منهج الطلاب في واتساب.');
});

// أمر ربط أو تغيير رقم الواتساب فوراً من تليجرام
bot.command('connect', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_TELEGRAM_ID) return;
    const text = ctx.message.text.replace('/connect', '').trim();
    
    if (!text) {
        return ctx.reply('⚠️ يرجى كتابة الرقم مع رمز الدولة بدون علامة +\nمثال: `/connect 249912345678`', { parse_mode: 'Markdown' });
    }

    ctx.reply(`⏳ جاري توليد كود الاقتران للرقم: \`${text}\`... يرجى الانتظار قليلاً لتلقي الكود هنا.`, { parse_mode: 'Markdown' });
    startWhatsAppClient(`session-${text}`);
});

bot.command('setcreator', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_TELEGRAM_ID) return;
    const newInfo = ctx.message.text.replace('/setcreator', '').trim();
    if (!newInfo) return ctx.reply('⚠️ اكتب النص الجديد بعد الأمر.');
    botCreatorInfo = newInfo;
    ctx.reply(`✅ تم تحديث بيانات صانع البوت بنجاح!`);
});

// تحديث المنهج عبر إرسال PDF لتليجرام
bot.on('document', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_TELEGRAM_ID) return;
    
    try {
        const doc = ctx.message.document;
        if (!doc.file_name.endsWith('.pdf')) {
            return ctx.reply('⚠️ يرجى إرسال ملف بصيغة PDF فقط.');
        }

        ctx.reply('⏳ جاري تحميل وقراءة ملف المقرر الدراسي...');
        const fileLink = await bot.telegram.link(doc.file_id);
        
        const fetch = (await import('node-fetch')).default;
        const res = await fetch(fileLink);
        const buffer = await res.buffer();
        const parsedPdf = await pdf(buffer);

        courseKnowledgeBase += `\n--- محتوى جديد --- \n` + parsedPdf.text;
        ctx.reply('✅ تم قراءة الملف وتحديث منهج البوت بنجاح!');
    } catch (e) {
        console.error(e);
        ctx.reply('⚠️ حدث خطأ أثناء معالجة الملف.');
    }
});

bot.launch();
console.log('🚀 لوحة تحكم تليجرام تعمل بنجاح بانتظار أوامر الاتصال بالواتساب!');
