export default {
  id: 'directory',
  purpose: {
    ru: 'Каталог AD показывает и меняет учётные записи Active Directory внутри одной OU — корня управления: дерево OU, пользователи, группы и компьютеры, статус, пароль, последний вход, состав групп. Каждое изменение выполняется от доменной учётной записи того администратора, который его делает, требует подтверждения и пишется в журнал. Связывает учётные записи AD с пользователями портала и карточками сотрудников.',
    en: 'The AD directory shows and changes Active Directory accounts inside one OU — the managed root: the OU tree, users, groups and computers, status, password, last sign-in, group membership. Every change runs as the acting administrator’s own domain account, needs a confirmation and is written to the journal. It links AD accounts with portal users and employee cards.',
  },
  audience: {
    ru: 'Системные администраторы и служба поддержки (helpdesk): приём и увольнение сотрудников, сброс паролей, разблокировка, поиск неактивных учётных записей.',
    en: 'System administrators and the helpdesk: onboarding and offboarding, password resets, unlocking, finding inactive accounts.',
  },
  setup: [
    {
      title: { ru: 'Подключите Active Directory', en: 'Connect Active Directory' },
      text: {
        ru: 'В [интеграции AD](/admin/settings/ad) — контроллер домена и **служебная учётная запись** с правом **чтения** корня управления (по умолчанию его даёт любая доменная учётка). Служебная учётка только читает: она ничего не меняет. Без интеграции модуль можно включить — его страница объяснит настройку, а суперадминистратор сможет заполнить демо-каталог.',
        en: 'In the [AD integration](/admin/settings/ad) — the domain controller and a **service account** that may **read** the managed root (any domain account can by default). The service account only reads: it never changes anything. Without the integration the module can still be switched on — its page explains the setup, and a superadministrator can fill the demo directory.',
      },
    },
    {
      title: { ru: 'Выберите корень и исключения', en: 'Choose the root and exclusions' },
      text: {
        ru: 'В [настройках модуля](/admin/settings/directory) — **корень управления**, например `OU=Accounts,DC=example,DC=local` (кнопка «Обзор» листает каталог от базового DN). Выше корня модуль ничего не показывает и не меняет. **Исключённые OU** — полный DN (OU со всем содержимым) или шаблон имени (`Service*`, `Admins`): их не видно в дереве, списках и поиске, и запрос с подделанным DN тоже получит отказ. **Скрытые учётные записи** — шаблоны логинов (`svc_*`, `adm-*`).',
        en: 'In the [module settings](/admin/settings/directory) — the **managed root**, e.g. `OU=Accounts,DC=example,DC=local` («Browse» walks the directory from the base DN). Nothing above it is shown or changed. **Excluded OUs** — a full DN (the OU with everything below) or a name pattern (`Service*`, `Admins`): they never appear in the tree, lists or search, and a request with a crafted DN is refused too. **Hidden accounts** — login patterns (`svc_*`, `adm-*`).',
      },
    },
    {
      title: { ru: 'Защищённый канал для паролей', en: 'A secure channel for passwords' },
      text: {
        ru: 'Active Directory принимает новый пароль (`unicodePwd`) только по шифрованному соединению. Включите «Использовать TLS» (LDAPS, порт 636) в интеграции или **StartTLS** в настройках модуля — на контроллере домена нужен сертификат. Кнопка «Проверить» в настройках покажет, работает ли канал. Без него всё остальное работает по LDAP без TLS, а сброс паролей недоступен — портал объясняет это прямо в диалоге. Пароли нигде не хранятся.',
        en: 'Active Directory accepts a new password (`unicodePwd`) only over an encrypted connection. Turn on «Use TLS» (LDAPS, port 636) in the integration or **StartTLS** in the module settings — the domain controller needs a certificate. «Check» in the settings shows whether it works. Without it everything else works over plain LDAP, and password reset is off — the dialog says so. Passwords are never stored.',
      },
    },
    {
      title: { ru: 'Делегируйте права администраторам в AD', en: 'Delegate rights to the administrators in AD' },
      text: {
        ru: 'Изменения выполняются от **собственной учётной записи AD** администратора портала (та же, что в «Файловый сервер → Доступ»): портал один раз спросит доменный пароль, проверит его входом в домен и сохранит зашифрованным. Поэтому права нужны в AD: например, делегируйте на `OU=Accounts` группе helpdesk «Reset password», «Read/Write lockoutTime», «Read/Write pwdLastSet», а администраторам — создание пользователей, запись атрибутов, перемещение и «Write Members» на группы.',
        en: 'Changes run as the portal administrator’s **own AD account** (the same as in «File server → Access»): the portal asks for the domain password once, checks it with a sign-in to the domain and keeps it encrypted. So the rights live in AD: e.g. delegate on `OU=Accounts` to the helpdesk group «Reset password», «Read/Write lockoutTime», «Read/Write pwdLastSet», and to administrators creating users, writing attributes, moving and «Write Members» on groups.',
      },
    },
    {
      title: { ru: 'Выдайте роли портала', en: 'Give portal roles' },
      text: {
        ru: 'Права `ad.view`, `ad.manage`, `ad.passwords`, `ad.admin` — в «Роли». Портальная роль — дополнительный слой: решает всё равно Active Directory. Задайте шаблон логина, UPN-суффиксы, OU для новых пользователей и «уволенных» — и модуль готов.',
        en: 'Permissions `ad.view`, `ad.manage`, `ad.passwords`, `ad.admin` — in Roles. The portal role is an extra layer: Active Directory still decides. Set the login template, UPN suffixes, OUs for new and offboarded users — and the module is ready.',
      },
    },
  ],
  roles: {
    'ad.view': { ru: 'Дерево, списки, карточки, журнал. Ничего не меняет.', en: 'Tree, lists, cards, journal. Changes nothing.' },
    'ad.manage': {
      ru: 'Создание пользователей, атрибуты, перемещение, включение и отключение, разблокировка, состав групп (кроме групп доступа к папкам `sg_…`).',
      en: 'Create users, attributes, move, enable / disable, unlock, group membership (except folder access groups `sg_…`).',
    },
    'ad.passwords': { ru: 'Сброс пароля с «сменить при входе» и разблокировка — для helpdesk. Нужен LDAPS или StartTLS.', en: 'Password reset with «must change at next logon» and unlocking — for the helpdesk. Needs LDAPS or StartTLS.' },
    'ad.admin': { ru: 'Всё, включая защищённые административные учётные записи (`adminCount`).', en: 'Everything, including protected administrative accounts (`adminCount`).' },
  },
  access: {
    ru: 'API-токены к модулю не допускаются; в режиме «войти как» доступен только просмотр. Группы доступа к папкам (`sg_…`) видны в карточке, но меняются только в «Файловый сервер → Доступ».',
    en: 'API tokens never reach the module; a «sign in as» session only reads. Folder access groups (`sg_…`) are shown in the card but changed only in «File server → Access».',
  },
  scenarios: [
    {
      title: { ru: 'Приём сотрудника', en: 'Onboarding an employee' },
      text: {
        ru: 'В карточке сотрудника — вкладка «Учётная запись AD» → «Создать пользователя AD для сотрудника»: ФИО и должность уже заполнены, логин по шаблону (`{f}.{last}` → `a.smirnova`, занятый получает номер), OU подразделения, начальный пароль с «сменить при входе», группы. Затем «Создать пользователя портала» в карточке AD — сотрудник входит доменным логином.',
        en: 'In the employee card — the «AD account» tab → «Create AD user for the employee»: names and title are filled in, the login follows the template (`{f}.{last}` → `a.smith`, a taken one gets a number), the unit’s OU, an initial password with «must change at next logon», groups. Then «Create portal user» in the AD card — the employee signs in with the domain login.',
      },
    },
    {
      title: { ru: 'Увольнение', en: 'Offboarding' },
      text: {
        ru: 'Отметьте учётные записи → «Увольнение»: предпросмотр покажет, что будет отключено и перенесено в OU отключённых (например, `OU=Disabled`), отказы (исключённые, защищённые) — до изменений. После подтверждения всё пишется в журнал.',
        en: 'Select the accounts → «Offboard»: the preview shows what is disabled and moved to the disabled OU (e.g. `OU=Disabled`) and what is refused (excluded, protected) — before anything changes. After the confirmation everything is journalled.',
      },
    },
    {
      title: { ru: 'Сброс пароля helpdesk', en: 'Password reset by the helpdesk' },
      text: {
        ru: 'Найдите человека поиском по всему корню → «Сбросить пароль»: «Сгенерировать», «сменить при входе», заодно разблокировать. Пароль уходит только по LDAPS/StartTLS и не сохраняется; передайте его лично или по телефону.',
        en: 'Find the person with the search across the root → «Reset password»: «Generate», «must change at next logon», unlock as well. The password travels only over LDAPS/StartTLS and is not stored; pass it on in person or by phone.',
      },
    },
    {
      title: { ru: 'Неактивные учётные записи', en: 'Inactive accounts' },
      text: {
        ru: 'Раздел «Неактивные» — не входили дольше N дней (настройка) или ни разу. Отсортируйте, проверьте, отключите или перенесите массово. `lastLogonTimestamp` в AD обновляется с задержкой до двух недель — это нормально.',
        en: 'The «Inactive» section — not signed in for more than N days (a setting) or never. Review, then disable or move in bulk. AD updates `lastLogonTimestamp` with a delay of up to two weeks — that is expected.',
      },
    },
  ],
  faq: [
    {
      q: { ru: 'Почему сброс пароля недоступен?', en: 'Why is password reset unavailable?' },
      a: { ru: 'Нет защищённого канала: Active Directory не принимает пароли по LDAP без TLS. Включите LDAPS в интеграции или StartTLS в настройках модуля и нажмите «Проверить».', en: 'There is no secure channel: Active Directory does not accept passwords over plain LDAP. Turn on LDAPS in the integration or StartTLS in the module settings and press «Check».' },
    },
    {
      q: { ru: 'Что значит «Active Directory отказал: нет прав»?', en: 'What does «Active Directory refused: no rights» mean?' },
      a: { ru: 'Портал разрешил действие, но вашей учётной записи AD не делегировано это право на OU. Попросите делегирование — портал не обходит права AD.', en: 'The portal allowed it, but your AD account has no delegated right on that OU. Ask for delegation — the portal never bypasses AD rights.' },
    },
    {
      q: { ru: 'Почему созданный пользователь отключён?', en: 'Why is a new user disabled?' },
      a: { ru: 'Без пароля Active Directory не включает учётную запись. Задайте пароль из карточки (нужен LDAPS/StartTLS) — флажок «включить» сделает остальное.', en: 'Without a password Active Directory does not enable an account. Set the password from the card (needs LDAPS/StartTLS).' },
    },
    {
      q: { ru: 'Где управлять группами sg_…?', en: 'Where do I manage sg_… groups?' },
      a: { ru: 'В «Файловый сервер → Доступ»: там они связаны с папками и правами NTFS. В карточке AD они показаны только для чтения со ссылкой.', en: 'In «File server → Access»: there they are tied to folders and NTFS rights. The AD card shows them read-only with a link.' },
    },
    {
      q: { ru: 'Можно ли без AD посмотреть модуль?', en: 'Can I try the module without AD?' },
      a: { ru: 'Да: суперадминистратор заполняет демо-каталог («Демо-данные» модуля). Он помечен «Демо-каталог», не обращается к LDAP и удаляется вместе с демо-данными.', en: 'Yes: a superadministrator fills the demo directory (the module’s demo data). It is badged «Demo directory», makes no LDAP calls and goes with the demo data.' },
    },
  ],
};
