import { registerDemo } from '../../services/demo.js';
import { simplePdf, sitePhoto, storeDemoBlob } from '../shared/demoAssets.js';
import { demoColleagues } from '../shared/demoPeople.js';
import { ROOM_LAST_MESSAGE_SQL } from './service.js';
import { removeStored } from './files.js';

/*
 * Demo data of Chat (pattern: modules/tasks/demo.js): three group chats and
 * three direct conversations of the administrator with demo colleagues, with
 * a few days of history — a photo and a PDF sent in the chat, @mentions of
 * the administrator and of colleagues, replies. The history is written
 * directly (backdated, like an import), so nobody gets notifications; the
 * administrator has unread messages in two of the chats.
 *
 * Purge removes the uploaded files from disk; the rooms take their members,
 * messages and file rows with them (ON DELETE CASCADE).
 */

const T = (ru, en, ky, tr, zh) => ({ ru, en, ky, tr, zh });

/**
 * Rooms. `with`: demo colleagues (roles of shared/demoPeople.js); `unread`: how many of the last
 * messages the administrator has not read. Messages: [who ('me' = the administrator), text, minutes ago, extra].
 * `{me}` / `{<role>}` in a text become @mentions.
 */
const ROOMS = [
  {
    kind: 'group',
    title: T('Демо: Северный квартал', 'Demo: North Quarter', 'Демо: Түндүк квартал', 'Demo: Kuzey Mahallesi', '演示：北区'),
    color: '#F59E0B',
    with: ['director', 'north', 'foreman', 'buyer'],
    unread: 2,
    messages: [
      ['north', T('Коллеги, это рабочий чат объекта «Северный квартал». Пишем сюда всё по стройке.', 'Colleagues, this is the «North Quarter» site chat. Everything about the build goes here.', 'Кесиптештер, бул «Түндүк квартал» объектинин жумушчу чаты. Курулуш боюнча бардыгын ушул жерге жазабыз.', 'Arkadaşlar, bu «Kuzey Mahallesi» şantiyesinin sohbeti. İnşaatla ilgili her şey buraya.', '各位同事，这是“北区”工地的工作群，施工相关的事情都发在这里。'), 3 * 1440 + 200],
      ['foreman', T('Кладка второго этажа закончена, фото ниже.', 'The second-floor brickwork is done, photo below.', 'Экинчи кабаттын дубалдары бүттү, сүрөтү төмөндө.', 'İkinci kat duvarları bitti, fotoğraf aşağıda.', '二层砌墙已完成，照片见下。'), 3 * 1440 + 120, { file: 'photo' }],
      ['director', T('Отлично! {foreman}, успеваем к кровле до конца месяца?', 'Great! {foreman}, are we on time for the roof by the end of the month?', 'Сонун! {foreman}, ай аягына чейин чатырга үлгүрөбүзбү?', 'Harika! {foreman}, ay sonuna kadar çatıya yetişiyor muyuz?', '太好了！{foreman}，月底前能赶上屋面施工吗？'), 3 * 1440 + 100],
      ['foreman', T('Да, если металлочерепицу привезут к среде.', 'Yes, if the metal roofing arrives by Wednesday.', 'Ооба, эгер металл черепицаны шаршембиге чейин алып келишсе.', 'Evet, çatı kaplaması çarşambaya kadar gelirse.', '可以，只要金属屋面瓦周三前到货。'), 3 * 1440 + 90, { reply: 2 }],
      ['buyer', T('Заявка на металлочерепицу согласована, поставщик ООО «Пример» обещает во вторник.', 'The roofing request is approved; the supplier Example LLC promises Tuesday.', 'Металл черепицага өтүнмө макулдашылды, жеткирүүчү «Мисал» ЖЧК шейшембиде убада кылып жатат.', 'Çatı kaplaması talebi onaylandı; tedarikçi Örnek Ltd. Şti. salı günü söz veriyor.', '金属屋面瓦的申请已批准，供应商“示例”有限责任公司承诺周二到货。'), 2 * 1440 + 300],
      ['north', T('{me}, посмотрите, пожалуйста, смету на кровлю в «Файлах» — нужна ваша отметка.', '{me}, please look at the roofing estimate in «Files» — your sign-off is needed.', '{me}, сураныч, «Файлдар» бөлүмүндөгү чатырдын сметасын карап чыгыңыз — сиздин белгиңиз керек.', '{me}, lütfen Dosyalar\'daki çatı keşfine bakın — onayınız gerekiyor.', '{me}，请查看“文件”中的屋面概算——需要您签字确认。'), 95],
      ['foreman', T('Завтра в 9:00 приёмка фундамента второй секции, кто будет?', 'Tomorrow at 9:00 — acceptance of the second section’s foundation. Who is coming?', 'Эртең саат 9:00до экинчи секциянын пайдубалын кабыл алуу. Ким келет?', 'Yarın 9:00\'da ikinci bölümün temel kabulü var. Kim geliyor?', '明天 9:00 验收第二单元基础，谁来参加？'), 40],
    ],
  },
  {
    kind: 'group',
    title: T('Демо: офис', 'Demo: office', 'Демо: кеңсе', 'Demo: ofis', '演示：办公室'),
    color: '#0EA5E9',
    with: ['director', 'hr', 'it', 'finance'],
    unread: 1,
    messages: [
      ['hr', T('Всем привет! В пятницу в 17:00 — день рождения компании, собираемся в переговорной «Север».', 'Hi all! Friday at 17:00 is the company’s birthday, we meet in the «North» meeting room.', 'Баарыңызга салам! Жума күнү саат 17:00дө — компаниянын туулган күнү, «Түндүк» сүйлөшүү бөлмөсүнө чогулабыз.', 'Herkese merhaba! Cuma 17:00\'de şirketin doğum günü; «Kuzey» toplantı odasında buluşuyoruz.', '大家好！周五 17:00 是公司生日，我们在“北”会议室集合。'), 2 * 1440 + 400],
      ['it', T('Напоминаю: в субботу с 10 до 12 плановые работы, почта будет недоступна.', 'A reminder: planned maintenance on Saturday 10–12, e-mail will be unavailable.', 'Эскертем: ишемби күнү саат 10дон 12ге чейин пландуу иштер жүрөт, почта иштебей калат.', 'Hatırlatma: cumartesi 10–12 arası planlı bakım var, e-posta kullanılamayacak.', '提醒：周六 10–12 点进行计划维护，届时邮件无法使用。'), 2 * 1440 + 200],
      ['me', T('Спасибо, {it}! Добавил в календарь.', 'Thanks, {it}! Added it to the calendar.', 'Рахмат, {it}! Календарга коштум.', 'Teşekkürler, {it}! Takvime ekledim.', '谢谢，{it}！已加到日历里了。'), 2 * 1440 + 180],
      ['finance', T('График отпусков на лето — в PDF. Проверьте свои даты до конца недели.', 'The summer vacation schedule is in the PDF. Check your dates by the end of the week.', 'Жайкы өргүүлөрдүн графиги — PDFте. Жуманын аягына чейин өз даталарыңызды текшериңиз.', 'Yaz izin planı PDF\'te. Tarihlerinizi hafta sonuna kadar kontrol edin.', '夏季休假安排见 PDF，请在本周末前核对自己的日期。'), 1440 + 60, { file: 'pdf' }],
      ['director', T('{hr}, подготовьте, пожалуйста, приветственный набор для двух новых сотрудников.', '{hr}, please prepare a welcome kit for the two new employees.', '{hr}, сураныч, эки жаңы кызматкер үчүн саламдашуу топтомун даярдаңыз.', '{hr}, lütfen iki yeni çalışan için hoş geldin paketi hazırlayın.', '{hr}，请为两位新同事准备欢迎礼包。'), 30],
    ],
  },
  {
    kind: 'group',
    title: T('Демо: закупки', 'Demo: procurement', 'Демо: сатып алуулар', 'Demo: satın alma', '演示：采购'),
    color: '#10B981',
    with: ['buyer', 'finance', 'foreman'],
    unread: 0,
    messages: [
      ['buyer', T('Счёт ООО «Пример» на арматуру пришёл, отправила на согласование.', 'The Example LLC invoice for rebar is in, sent it for approval.', '«Мисал» ЖЧКнын арматура боюнча эсеп-дүмүрчөгү келди, макулдашууга жөнөттүм.', 'Örnek Ltd. Şti.\'nin inşaat demiri faturası geldi, onaya gönderdim.', '“示例”有限责任公司的钢筋发票到了，已提交审批。'), 1440 + 500],
      ['finance', T('Вижу, оплатим в четверг.', 'Got it, we pay on Thursday.', 'Көрдүм, бейшембиде төлөйбүз.', 'Gördüm, perşembe ödüyoruz.', '收到，周四付款。'), 1440 + 470],
      ['foreman', T('{buyer}, добавь ещё 20 мешков цемента к следующей заявке.', '{buyer}, add 20 more bags of cement to the next request.', '{buyer}, кийинки өтүнмөгө дагы 20 кап цемент кош.', '{buyer}, bir sonraki talebe 20 torba çimento daha ekle.', '{buyer}，下一个申请里再加 20 袋水泥。'), 1440 + 300],
      ['me', T('Согласовал. Спасибо всем!', 'Approved. Thanks, everyone!', 'Макулдаштым. Баарыңызга рахмат!', 'Onayladım. Herkese teşekkürler!', '已批准。谢谢大家！'), 1440 + 200],
    ],
  },
  {
    kind: 'direct',
    with: ['director'],
    unread: 1,
    messages: [
      ['director', T('Привет! Покажешь портал заказчику в четверг?', 'Hi! Could you show the portal to the client on Thursday?', 'Салам! Бейшембиде заказчиге порталды көрсөтүп бересиңби?', 'Merhaba! Perşembe günü portalı müşteriye gösterebilir misin?', '你好！周四能给客户演示一下门户吗？'), 300],
      ['me', T('Да, демо-данные уже заполнены.', 'Yes, the demo data is already filled.', 'Ооба, демо маалыматтар толтурулуп коюлган.', 'Evet, demo verileri zaten dolduruldu.', '可以，演示数据已经填好了。'), 280],
      ['director', T('Супер, тогда в 11:00 у меня.', 'Great, then 11:00 in my office.', 'Сонун, анда саат 11:00дө менде.', 'Süper, o zaman 11:00\'de benim odamda.', '好的，那 11:00 到我办公室。'), 20],
    ],
  },
  {
    kind: 'direct',
    with: ['it'],
    unread: 0,
    messages: [
      ['it', T('Подключил новый принтер на втором этаже, он уже в списке.', 'I connected the new printer on the second floor, it’s already in the list.', 'Экинчи кабатта жаңы принтерди туташтырдым, ал тизмеде бар.', 'İkinci kattaki yeni yazıcıyı bağladım, listede görünüyor.', '二楼的新打印机已连好，已经在列表里了。'), 1440 + 90],
      ['me', T('Спасибо! А сканирование в «Файлы» работает?', 'Thanks! Does scanning to «Files» work?', 'Рахмат! «Файлдарга» сканерлөө иштейби?', 'Teşekkürler! Dosyalar\'a tarama çalışıyor mu?', '谢谢！扫描到“文件”能用吗？'), 1440 + 80],
      ['it', T('Да, папка «Сканы» в общем пространстве.', 'Yes, the «Scans» folder in the shared space.', 'Ооба, жалпы мейкиндиктеги «Скандар» папкасы.', 'Evet, paylaşılan alandaki «Taramalar» klasörü.', '可以，在共享空间的“扫描件”文件夹里。'), 1440 + 70],
    ],
  },
  {
    kind: 'direct',
    with: ['foreman'],
    unread: 0,
    messages: [
      ['foreman', T('Отправил фото с объекта в общий чат.', 'I sent the site photos to the group chat.', 'Объекттин сүрөттөрүн жалпы чатка жөнөттүм.', 'Şantiye fotoğraflarını grup sohbetine gönderdim.', '工地照片已发到群里了。'), 3 * 1440 + 110],
      ['me', T('Видел, хорошая работа 👍', 'Saw them, good work 👍', 'Көрдүм, жакшы иш 👍', 'Gördüm, eline sağlık 👍', '看到了，干得好 👍'), 3 * 1440 + 60],
    ],
  },
];

async function storeFile(ctx, kind) {
  const isPhoto = kind === 'photo';
  const bytes = isPhoto ? sitePhoto({ progress: 0.55, seed: 4 }) : simplePdf(['Vacation schedule - summer', 'Demo company', '', 'June: 2 people', 'July: 4 people', 'August: 3 people', '', 'Demo document.']);
  // storeDemoBlob keys are relative to UPLOAD_DIR ("chat/2026/10/…"); chat keys to UPLOAD_DIR/chat.
  const blob = await storeDemoBlob('chat', isPhoto ? 'png' : 'pdf', bytes);
  return {
    key: blob.key.replace(/^chat\//, ''),
    size: blob.size,
    mime: isPhoto ? 'image/png' : 'application/pdf',
    name: isPhoto ? ctx.t(T('Кладка 2 этаж.png', 'Brickwork 2nd floor.png', 'Дубал 2-кабат.png', 'Duvar 2. kat.png', '砌墙 二层.png')) : ctx.t(T('График отпусков.pdf', 'Vacation schedule.pdf', 'Өргүүлөрдүн графиги.pdf', 'İzin planı.pdf', '休假安排.pdf')),
  };
}

registerDemo({
  module: 'chat',
  after: ['org', 'employees'],
  describe: {
    ru: 'Три групповых чата («Северный квартал», «Офис», «Закупки») и три личные переписки с демо-коллегами: история за несколько дней, фото и PDF, упоминания, непрочитанные сообщения.',
    en: 'Three group chats («North Quarter», «Office», «Procurement») and three direct conversations with demo colleagues: a few days of history, a photo and a PDF, mentions, unread messages.',
    ky: 'Үч топтук чат («Түндүк квартал», «Кеңсе», «Сатып алуулар») жана демо кесиптештер менен үч жеке кат алышуу: бир нече күндүк тарых, сүрөт жана PDF, эскерүүлөр, окулбаган билдирүүлөр.',
    tr: 'Üç grup sohbeti («Kuzey Mahallesi», «Ofis», «Satın alma») ve demo iş arkadaşlarıyla üç birebir sohbet: birkaç günlük geçmiş, bir fotoğraf ve bir PDF, bahsetmeler, okunmamış mesajlar.',
    zh: '三个群聊（“北区”“办公室”“采购”）以及与演示同事的三个私聊：几天的聊天记录、一张照片和一个 PDF、提及、未读消息。',
  },
  async seed(ctx) {
    const people = await demoColleagues(ctx, ['director', 'finance', 'hr', 'north', 'foreman', 'it', 'buyer']);
    const { rows: meRows } = await ctx.query(`SELECT username FROM users WHERE id = $1`, [ctx.userId]);
    const mention = (role) => `@${role === 'me' ? meRows[0].username : people[role].username}`;
    const text = (value) => ctx.t(value).replace(/\{(\w+)\}/g, (_, role) => (role === 'me' || people[role] ? mention(role) : `{${role}}`));
    const now = Date.now();
    const at = (minutesAgo) => new Date(now - minutesAgo * 60000);

    for (const room of ROOMS) {
      const members = room.with.map((role) => people[role].id);
      let roomId;
      if (room.kind === 'direct') {
        const key = [ctx.userId, members[0]].sort((a, b) => a - b).join(':');
        const made = await ctx.query(`INSERT INTO chat_rooms (kind, direct_key, created_by, created_at) VALUES ('direct', $1, $2, $3) ON CONFLICT (direct_key) DO NOTHING RETURNING id`, [
          key,
          members[0],
          at(room.messages[0][2] + 5),
        ]);
        // The administrator already talks to this colleague: their own conversation is left alone.
        if (!made.rows[0]) continue;
        roomId = made.rows[0].id;
      } else {
        const made = await ctx.query(`INSERT INTO chat_rooms (kind, title, color, created_by, created_at) VALUES ('group', $1, $2, $3, $4) RETURNING id`, [
          ctx.t(room.title),
          room.color,
          ctx.userId,
          at(room.messages[0][2] + 5),
        ]);
        roomId = made.rows[0].id;
      }
      await ctx.track('chat_rooms', roomId);
      await ctx.query(`INSERT INTO chat_members (room_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)`, [roomId, ctx.userId, room.kind === 'group' ? 'owner' : 'member', at(room.messages[0][2] + 5)]);
      for (const id of members) await ctx.query(`INSERT INTO chat_members (room_id, user_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [roomId, id, at(room.messages[0][2] + 5)]);
      if (room.kind === 'group') {
        const made = await ctx.query(`INSERT INTO chat_messages (room_id, author_id, kind, data, created_at) VALUES ($1, $2, 'system', $3, $4) RETURNING id`, [
          roomId,
          ctx.userId,
          JSON.stringify({ event: 'chat.created', title: ctx.t(room.title) }),
          at(room.messages[0][2] + 5),
        ]);
        await ctx.track('chat_messages', made.rows[0].id);
      }
      const ids = [];
      let last = null;
      for (const [who, body, minutesAgo, extra = {}] of room.messages) {
        const authorId = who === 'me' ? ctx.userId : people[who].id;
        const { rows } = await ctx.query(
          `INSERT INTO chat_messages (room_id, author_id, kind, body, reply_to_id, created_at) VALUES ($1, $2, 'text', $3, $4, $5) RETURNING id, created_at`,
          [roomId, authorId, text(body), extra.reply ? ids[extra.reply - 1] : null, at(minutesAgo)]
        );
        ids.push(rows[0].id);
        last = rows[0];
        await ctx.track('chat_messages', rows[0].id);
        if (extra.file) {
          const file = await storeFile(ctx, extra.file);
          const made = await ctx.query(
            `INSERT INTO chat_files (room_id, message_id, uploaded_by, name, mime, size, storage_key, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [roomId, rows[0].id, authorId, file.name, file.mime, file.size, file.key, at(minutesAgo)]
          );
          await ctx.track('chat_files', made.rows[0].id);
        }
      }
      await ctx.query(ROOM_LAST_MESSAGE_SQL, [roomId, last.id, last.created_at]);
      // Everyone has read their room, the administrator all but the last `unread` messages.
      await ctx.query(`UPDATE chat_members SET last_read_id = $2 WHERE room_id = $1`, [roomId, last.id]);
      const readTo = room.unread ? ids[ids.length - 1 - room.unread] : last.id;
      await ctx.query(`UPDATE chat_members SET last_read_id = $3 WHERE room_id = $1 AND user_id = $2`, [roomId, ctx.userId, readTo || 0]);
    }
  },
  async purge(ctx) {
    const rooms = await ctx.records('chat_rooms');
    if (!rooms.length) return;
    // Files sent in the demo rooms (also by people since) go from the disk; the rows go with the rooms.
    const { rows } = await ctx.query(`SELECT storage_key FROM chat_files WHERE room_id = ANY($1::int[])`, [rooms]);
    await ctx.query(`DELETE FROM chat_rooms WHERE id = ANY($1::int[])`, [rooms]);
    for (const row of rows) await removeStored(row.storage_key);
  },
});
