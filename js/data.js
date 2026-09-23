/* ============================================================
   ТЕЛЕМАСТЕР — данные каталога
   Единый источник правды для витрины, категорий и корзины.
   При подключении бэкенда/1С заменяется на API-ответ.
   Формат позиции: { id, name, sku, price, oldPrice?, stock, desc?, img? }
   - desc: короткое описание для карточки товара (1-2 предложения)
   - img: путь к фото (например "img/stm32.jpg"); если пусто — SVG-иконка
   ============================================================ */
(function () {
  "use strict";

  const ICONS = {
    chip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 7V4M14 7V4M10 20v-3M14 20v-3M7 10H4M7 14H4M20 10h-3M20 14h-3"/></svg>',
    ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M8 8V5M12 8V5M16 8V5M8 19v-3M12 19v-3M16 19v-3"/></svg>',
    wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 12h3l2-5 3 10 3-14 3 12 2-3h4"/></svg>',
    sensor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v3a4 4 0 0 0 8 0V3M12 10v11M8 21h8"/><circle cx="12" cy="14" r="2"/></svg>',
    conn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="8" width="6" height="8" rx="1"/><rect x="15" y="8" width="6" height="8" rx="1"/><path d="M9 12h6"/></svg>',
    tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4L15 12l-3-3 2.7-2.7z"/></svg>',
  };

  /* Иллюстрации товаров: рисованный лайн-арт в фирменном стиле.
     Свои, офлайн, не зависят от чужих CDN. viewBox 96 — смотрятся и в
     карточке (84px), и в галерее (140px), и в корзине. */
  const SW = '<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">';
  const ART = {
    chip: SW + '<rect x="30" y="30" width="36" height="36" rx="5"/><circle cx="38" cy="38" r="2" fill="currentColor" stroke="none"/><path d="M38 30v-8M48 30v-8M58 30v-8M38 66v8M48 66v8M58 66v8M30 38h-8M30 48h-8M30 58h-8M66 38h8M66 48h8M66 58h8"/></svg>',
    wifi: SW + '<rect x="22" y="40" width="38" height="24" rx="3"/><path d="M30 64v8M41 64v8M52 64v8M66 40V24M60 30l6-6 6 6M22 48h-6M22 56h-6"/></svg>',
    dip: SW + '<rect x="34" y="26" width="28" height="44" rx="4"/><circle cx="48" cy="33" r="2"/><path d="M34 40H26M34 52H26M34 64H26M62 40h8M62 52h8M62 64h8"/></svg>',
    board: SW + '<rect x="30" y="20" width="36" height="56" rx="5"/><rect x="40" y="20" width="16" height="8"/><circle cx="48" cy="66" r="3"/><path d="M37 34v26M59 34v26" stroke-dasharray="3 4"/></svg>',
    driver: SW + '<rect x="22" y="42" width="52" height="24" rx="3"/><path d="M34 42V30M42 42V30M50 42V30M58 42V30M34 30h24M22 50h-8M22 58h-8M74 50h8M74 58h8"/></svg>',
    sot: SW + '<rect x="38" y="36" width="20" height="26" rx="2"/><path d="M48 36V26M42 62v8M48 62v8M54 62v8"/></svg>',
    resistor: SW + '<path d="M12 48h16M68 48h16"/><rect x="28" y="41" width="40" height="14" rx="7"/><path d="M40 41v14M48 41v14M56 41v14"/></svg>',
    ceramic: SW + '<circle cx="48" cy="40" r="13"/><path d="M42 51v22M54 51v22"/></svg>',
    electro: SW + '<rect x="37" y="28" width="22" height="34" rx="3"/><path d="M37 36h22M43 42v10M43 62v12M53 62v12"/></svg>',
    probe: SW + '<rect x="41" y="32" width="14" height="28" rx="7"/><path d="M48 32V12M40 18h16M44 60v14M52 60v14"/></svg>',
    box: SW + '<rect x="28" y="32" width="40" height="30" rx="4"/><path d="M36 41h24M36 49h24M38 62v10M48 62v10M58 62v10"/></svg>',
    dome: SW + '<path d="M30 52a18 18 0 0 1 36 0"/><rect x="26" y="52" width="44" height="10" rx="3"/><path d="M38 62v10M58 62v10"/></svg>',
    relay: SW + '<rect x="16" y="54" width="64" height="14" rx="3"/><rect x="21" y="38" width="11" height="16"/><rect x="34.5" y="38" width="11" height="16"/><rect x="48" y="38" width="11" height="16"/><rect x="61.5" y="38" width="11" height="16"/><path d="M28 68v8M48 68v8M68 68v8"/></svg>',
    terminal: SW + '<rect x="28" y="38" width="40" height="24" rx="4"/><path d="M56 38l10-10M40 62v10M56 62v10"/></svg>',
    wires: SW + '<path d="M34 24c-8 18 8 28 0 46M48 24c-8 18 8 28 0 46M62 24c-8 18 8 28 0 46"/><rect x="28" y="14" width="12" height="10" rx="2"/><rect x="42" y="14" width="12" height="10" rx="2"/><rect x="56" y="14" width="12" height="10" rx="2"/></svg>',
    usb: SW + '<rect x="24" y="38" width="48" height="20" rx="3"/><path d="M24 46h48M32 38v-6M44 38v-6M56 38v-6M64 58v6M32 58v6"/></svg>',
    breadboard: SW + '<rect x="18" y="30" width="60" height="36" rx="4"/><path d="M26 38h44M26 58h44"/><path d="M32 44v8M40 44v8M48 44v8M56 44v8M64 44v8" stroke-dasharray="2 3"/></svg>',
    spool: SW + '<ellipse cx="48" cy="34" rx="16" ry="6"/><path d="M32 34v24M64 34v24"/><ellipse cx="48" cy="58" rx="16" ry="6"/><path d="M64 46c10 2 12 12 4 18"/></svg>',
    syringe: SW + '<rect x="40" y="26" width="16" height="30" rx="3"/><path d="M48 26V14M44 14h8M40 34h5M40 42h5M40 50h5M44 56v6M52 56v6M48 62v16"/></svg>',
    meter: SW + '<rect x="32" y="18" width="32" height="60" rx="8"/><rect x="38" y="26" width="20" height="12" rx="2"/><circle cx="48" cy="56" r="8"/><circle cx="48" cy="56" r="2" fill="currentColor" stroke="none"/><path d="M40 78v6M56 78v6"/></svg>',
    iron: SW + '<path d="M30 62L58 34" stroke-width="7"/><path d="M58 34l12-12M30 62c-6 6-12 8-16 14M70 32c3-3 3-7 0-10"/></svg>',
  };

  const CATALOG = [
    {
      id: "mcu",
      name: "Микроконтроллеры",
      icon: "chip",
      desc: "STM, AVR, ESP32 — от отладочных плат до промышленных серий.",
      items: [
        { id: "stm32f103", name: "Микроконтроллер STM32F103C8T6", sku: "STM-F103-C8T6", price: 420, stock: 1240, desc: "Легендарный «синий таблеточный» чип: ARM Cortex-M3, 72 МГц, 64 КБ Flash. База для учебных и промышленных проектов." },
        { id: "esp32", name: "Модуль ESP32-WROOM-32 с Wi-Fi и Bluetooth", sku: "ESP32-WROOM-32", price: 560, stock: 860, desc: "Двухъядерный Wi-Fi + Bluetooth модуль с антенной на плате. Для IoT, умного дома и быстрого прототипирования." },
        { id: "atmega328p", name: "ATMEGA328P-PU, DIP-28", sku: "ATM-328P-PU", price: 210, stock: 430, desc: "Классика Arduino Uno в корпусе DIP-28. Легко паяется и меняется без фена, идеален для макеток." },
        { id: "nano", name: "Отладочная плата Arduino Nano CH340", sku: "BRD-NANO-CH340", price: 350, stock: 210, desc: "Компактный клон Nano на CH340. Прошивается по USB, встаёт в макетку — для первых проектов то, что надо." },
        { id: "rp2040", name: "Raspberry Pi RP2040-Zero", sku: "RP2040-ZERO", price: 390, stock: 12, desc: "Миниатюрная плата на чипе RP2040: два ядра, USB-C, программируемые PIO-блоки. Остаток мал — разбирают быстро." },
      ],
    },
    {
      id: "ic",
      name: "Микросхемы",
      icon: "ic",
      desc: "Усилители, драйверы, стабилизаторы, логика и память.",
      items: [
        { id: "ne555", name: "Таймер NE555, DIP-8", sku: "IC-NE555-DIP8", price: 25, stock: 3200, desc: "Самый известный таймер: мигалки, ШИМ, генераторы и звуковые схемы. Работает от 4,5 до 16 В." },
        { id: "lm358", name: "Операционный усилитель LM358, DIP-8", sku: "IC-LM358-DIP8", price: 18, stock: 2400, desc: "Сдвоенный ОУ для датчиков, компараторов и фильтров. Живёт от однополярного питания 3–32 В." },
        { id: "ams1117", name: "Стабилизатор AMS1117-3.3, SOT-223", sku: "IC-AMS1117-33", price: 15, stock: 1800, desc: "Линейный стабилизатор 5 В → 3,3 В до 1 А. Маст-хэв для питания ESP32 и STM32 от USB." },
        { id: "l298n", name: "Драйвер моторов L298N", sku: "IC-L298N", price: 130, stock: 340, desc: "Двухканальный драйвер коллекторных моторов до 2 А на канал. Для роботележек и станков." },
        { id: "uln2003", name: "Сборка Дарлингтона ULN2003, DIP-16", sku: "IC-ULN2003", price: 35, stock: 950, desc: "7 ключей до 500 мА для реле, шаговиков и светодиодных линеек. Управляется прямо с GPIO." },
      ],
    },
    {
      id: "passive",
      name: "Резисторы и конденсаторы",
      icon: "wave",
      desc: "Выводные и SMD-компоненты, готовые наборы для макетирования.",
      items: [
        { id: "mf50set", name: "Набор резисторов MF-50W, 30 номиналов, 610 шт", sku: "R-MF50-610", price: 890, oldPrice: 1090, stock: 140, desc: "Ходовые номиналы от 10 Ом до 1 МОм в подписанных пакетиках. Хватит на год макетирования." },
        { id: "ker300", name: "Набор керамических конденсаторов, 24 номинала, 300 шт", sku: "C-KER-300", price: 640, stock: 260, desc: "От пикофарад до микрофарад: фильтры питания, развязка, времязадающие цепи — всё в одной коробке." },
        { id: "r10k", name: "Резистор 10 кОм ±1%, 0,25 Вт", sku: "R-MF25-10K", price: 3, stock: 9000, desc: "Самый ходовой номинал для подтяжек и делителей. Металлоплёночный, точность 1%. Цена за штуку." },
        { id: "c100nf", name: "Конденсатор 100 нФ 50 В X7R", sku: "C-X7R-100N", price: 5, stock: 7400, desc: "Развязывающий конденсатор №1: ставится у питания каждой микросхемы. Диэлектрик X7R, стабилен." },
        { id: "electro", name: "Конденсатор электролитический 470 мкФ 25 В", sku: "C-EL-470-25", price: 9, stock: 3100, desc: "Сглаживание пульсов в блоках питания и усилителях. Low-ESR серия, 105 °C." },
      ],
    },
    {
      id: "sensors",
      name: "Датчики и модули",
      icon: "sensor",
      desc: "Температура, влажность, движение, реле — для IoT и автоматизации.",
      items: [
        { id: "ds18b20", name: "Датчик температуры DS18B20, влагозащищённый", sku: "S-DS18B20-W", price: 150, stock: 2050, desc: "Цифровой термометр в гильзе с кабелем 1 м. Точность ±0,5 °C, шина 1-Wire — вешается несколько штук на один пин." },
        { id: "dht22", name: "Датчик температуры и влажности DHT22 / AM2302", sku: "S-DHT22", price: 260, stock: 480, desc: "Температура ±0,5 °C и влажность ±2%. Для метеостанций и теплиц, библиотека есть под Arduino и ESP." },
        { id: "bmp280", name: "Датчик давления BMP280, I²C/SPI", sku: "S-BMP280", price: 190, stock: 620, desc: "Барометр и высотомер в одном: давление, высота, температура. Общается по I²C или SPI." },
        { id: "pir", name: "Датчик движения HC-SR501 PIR", sku: "S-HC-SR501", price: 120, stock: 730, desc: "Инфракрасный детектор движения с регулировкой чувствительности и задержки. Для охраны и автовключения света." },
        { id: "rel4ch", name: "Модуль реле 5 В, 4 канала, с оптопарой", sku: "M-RELAY-4CH", price: 340, stock: 560, desc: "4 реле по 10 А с опторазвязкой и светодиодами. Коммутирует свет, насосы и нагреватели от микроконтроллера." },
      ],
    },
    {
      id: "conn",
      name: "Разъёмы и клеммы",
      icon: "conn",
      desc: "Клеммники, клеммы WAGO, соединители, провода и колодки.",
      items: [
        { id: "wago221", name: "Клеммы WAGO 221-412, комплект 10 шт", sku: "K-WAGO-221-412", price: 160, stock: 890, desc: "Оригинальные рычажковые клеммы на 2 провода до 4 мм². Монтаж без отвёртки за секунды." },
        { id: "dupont", name: "Провода Dupont «мама-мама», 20 см, 120 шт", sku: "W-DUP-120", price: 230, stock: 410, desc: "Гибкие перемычки для макеток: 120 штук, цвета в ассортименте. Не ломаются у разъёма." },
        { id: "jst", name: "Разъём JST-XH 2,54 мм, комплект", sku: "K-JST-XH", price: 85, stock: 1200, desc: "Комплект корпусов и контактов JST-XH для аккумуляторов и шлейфов. Шаг 2,54 мм." },
        { id: "klemm", name: "Клеммник печатный 5,08 мм, 2 контакта", sku: "K-PCB-508-2", price: 12, stock: 5600, desc: "Винтовой клеммник на плату для питания и силовых выходов. Держит до 10 А." },
        { id: "usba", name: "Гнездо USB-A печатное, угол 90°", sku: "K-USB-A", price: 22, stock: 2300, desc: "Угловое гнездо USB-A для самодельных хабов, зарядок и программаторов." },
      ],
    },
    {
      id: "tools",
      name: "Инструмент и пайка",
      icon: "tool",
      desc: "Паяльное оборудование, расходники, макетные платы, измерения.",
      items: [
        { id: "bb830", name: "Макетная плата 830 точек + шины питания", sku: "BB-830", price: 190, stock: 380, desc: "Беспаечная макетка на 830 точек с раздельными шинами питания. Контакты не разбалтываются." },
        { id: "solder", name: "Припой ПОС-61, 0,8 мм, 50 г", sku: "T-POS61-08", price: 320, stock: 240, desc: "Классический оловянно-свинцовый припой с канифолью внутри. Течёт отлично, блестит." },
        { id: "flux", name: "Флюс RMA-223, шприц 10 мл", sku: "T-RMA223", price: 140, stock: 520, desc: "Гелеобразный флюс для SMD и лужения. Не кипит, смывается легко, пайка чистая." },
        { id: "t12", name: "Паяльная станция KSGER T12 с жалом", sku: "T-KSGER-T12", price: 2800, stock: 45, desc: "Быстрый нагрев за секунды, сменные жала T12, цифровой дисплей. Для дома и мелкой серии." },
        { id: "dt832", name: "Мультиметр DT-832", sku: "T-DT832", price: 450, stock: 160, desc: "Рабочая лошадка: напряжение, ток, сопротивление, прозвонка. Щупы и батарейка в комплекте." },
      ],
    },
  ];

  // плоский список с указанием категории — для поиска и корзины
  const ALL = [];
  CATALOG.forEach((cat) => {
    cat.items.forEach((item) => {
      ALL.push({ ...item, cat });
    });
  });

  window.TM = {
    ICONS,
    ART,
    CATALOG,
    ALL,
    findProduct: (id) => ALL.find((p) => p.id === id) || null,
  };
})();
