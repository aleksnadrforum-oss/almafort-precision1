import { toast } from "sonner";
import { useCart } from "@/store/cart-store";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import { Download, FileText, Layers, Ruler, Truck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "@/data/catalog";
import { trackCadDownload, trackViewItem } from "@/lib/metrika";
import { CityInput, type CityValue } from "@/components/cart/city-input";
import { BulkRequestDialog } from "@/components/catalog/bulk-request-dialog";
import { useAssetGroups } from "@/lib/asset-groups";
import { useDebounce } from "@/hooks/use-debounce";
import type { ShippingQuote } from "@/lib/logistics";

type PartMaterial = {
  roughness: number;
  metalness: number;
  opacity?: number;
  clearcoat?: number;
  texture?: "shagreen";
};

type CadViewerProps = {
  glbUrl: string | null;
  category: string;
  color?: string;
  material?: PartMaterial;
};

type Swatch = { hex: string; label: string; opacity?: number; roughness?: number; borderColor?: string };

type PartProfile = {
  colorLabel: string;
  material: PartMaterial;
  description: string;
  palette?: Swatch[];
  disclaimer?: string;
};

const DOVETAIL_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный" },
  { hex: "#3e2723", label: "Тёмно-коричневый / Венге" },
  { hex: "#6a3326", label: "Красно-коричневый / Махагон" },
  { hex: "#8d6e63", label: "Светло-коричневый / Орех" },
  { hex: "#d7ccc8", label: "Бежевый / Слоновая кость" },
  { hex: "#757575", label: "Серый" },
  { hex: "#f5f5f5", label: "Полупрозрачный / Натуральный полимер", opacity: 0.8 },
];

const DOVETAIL_PROFILE: PartProfile = {
  colorLabel: "Чёрный",
  material: { roughness: 0.45, metalness: 0.0 },
  description:
    "Универсальный крепёжный элемент «Ласточкин хвост» для скрытого монтажа и прочного соединения листовых материалов, мебельных деталей и конструкционных профилей. Надёжная фиксация узла достигается за счёт точной клиновидной геометрии и боковых фрикционных рёбер, полностью исключающих люфт после сборки. Изготовлен из износостойкого полимера, устойчивого к механическим нагрузкам. Расширенная цветовая гамма и наличие полупрозрачного варианта позволяют сделать соединение визуально незаметным на любом материале.",
  palette: DOVETAIL_PALETTE,
};

const DOVETAIL_CAP_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный" },
  { hex: "#3e2723", label: "Тёмно-коричневый" },
  { hex: "#6a3326", label: "Красно-коричневый / Махагон" },
  { hex: "#d7ccc8", label: "Бежевый / Песочный" },
  { hex: "#757575", label: "Серый" },
  { hex: "#f5f5f5", label: "Полупрозрачный / Натуральный", opacity: 0.8 },
];

const DOVETAIL_CAP_PROFILE: PartProfile = {
  colorLabel: "Чёрный",
  material: { roughness: 0.45, metalness: 0.0 },
  description:
    "Модифицированный крепёжный элемент «Ласточкин хвост», оснащённый интегрированной декоративной заглушкой. Предназначен для надёжного скрытого соединения деталей с одновременным эстетичным перекрытием монтажного паза. Плоская заглушка образует аккуратный торец вровень с поверхностью, дополнительно защищая крепёжный узел от попадания пыли и влаги. Оптимальное решение для лицевых фасадов и видимых частей конструкций. Широкая палитра литьевых оттенков позволяет подобрать деталь точно в тон собираемого изделия.",
  palette: DOVETAIL_CAP_PALETTE,
};

const LATHOLDER_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный (Базовый)" },
];

const LATHOLDER_PROFILE: PartProfile = {
  colorLabel: "Чёрный (Базовый)",
  material: { roughness: 0.8, metalness: 0.0 },
  description:
    "Универсальный пластиковый латодержатель для надёжной фиксации ортопедических деревянных лат (ламелей) к металлическому или деревянному каркасу мягкой мебели. Деталь выполняет функцию амортизатора: надёжно удерживает ламель, предотвращает скрип, гасит вибрации и полностью исключает трение древесины о конструкцию основания. Изготавливается из эластичного, ударопрочного полимера, рассчитанного на постоянные циклические нагрузки. Оптимальное стандартизированное решение для конвейерного производства кроватей, диванов и ортопедических решёток.",
  palette: LATHOLDER_PALETTE,
};

const GLASSHOLDER_PALETTE: Swatch[] = [
  { hex: "#1c3aa9", label: "Синий" },
  { hex: "#4ebaaa", label: "Мятный / Бирюзовый" },
  { hex: "#ffffff", label: "Белый" },
  { hex: "#dcb98a", label: "Бежевый" },
  { hex: "#8c9091", label: "Серый" },
  { hex: "#382a24", label: "Тёмно-коричневый" },
  { hex: "#f0f0f0", label: "Полупрозрачный / Матовый", opacity: 0.6, roughness: 0.2 },
];

const GLASSHOLDER_PROFILE: PartProfile = {
  colorLabel: "Синий",
  material: { roughness: 0.5, metalness: 0.0 },
  description:
    "Специализированный пластиковый крепёж (стеклодержатель) с интегрированной декоративной крышкой для безопасной фиксации стекол и зеркал к мебельным фасадам. Конструкция детали состоит из базового прижимного элемента и откидной заглушки. Упругий полимер обеспечивает плотное прилегание к хрупкому материалу, амортизирует микровибрации и полностью исключает риск образования сколов при затягивании самореза. После монтажа крышка защёлкивается, скрывая металлическую шляпку метиза и образуя аккуратный, законченный узел. Широкий выбор оттенков, включая полупрозрачный вариант, позволяет сделать фурнитуру максимально незаметной на любом фоне.",
  palette: GLASSHOLDER_PALETTE,
};

const ANGLE_BRACKET_PALETTE: Swatch[] = [
  { hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" },
  { hex: "#e8d5c4", label: "Бежевый" },
  { hex: "#d4a373", label: "Бук" },
  { hex: "#5d4037", label: "Коричневый" },
  { hex: "#8d6e63", label: "Орех светлый" },
  { hex: "#3e2723", label: "Орех тёмный" },
  { hex: "#000000", label: "Чёрный" },
  { hex: "#1976d2", label: "Синий" },
  { hex: "#388e3c", label: "Зелёный" },
  { hex: "#722f37", label: "Вишня" },
];

const ANGLE_BRACKET_PROFILE: PartProfile = {
  colorLabel: "Белый",
  material: { roughness: 0.6, metalness: 0.0 },
  description:
    "Классический мебельный крепёжный уголок из прочного пластика для жёсткого соединения деталей из ЛДСП, МДФ и массива под прямым углом (90 градусов). Обеспечивает надёжную стяжку элементов каркаса, полок, ящиков и внутренних перегородок. Усиленная конструкция устойчива к нагрузкам на излом и вырывание саморезов. Широкая палитра, включающая как монохромные оттенки, так и имитацию популярных древесных декоров, позволяет подобрать крепёж тон в тон. Это делает узел соединения визуально незаметным и сохраняет эстетику внутреннего пространства готовой мебели.",
  palette: ANGLE_BRACKET_PALETTE,
};

const SHELF_GLASSHOLDER_PALETTE: Swatch[] = [
  { hex: "#8c9091", label: "Серый (базовый)" },
  { hex: "#000000", label: "Чёрный" },
  { hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" },
];

const SHELF_GLASSHOLDER_PROFILE: PartProfile = {
  colorLabel: "Серый (базовый)",
  material: { roughness: 0.65, metalness: 0.0 },
  description:
    "Держатель для стеклянных полок S=4 и 5 мм. Специализированный пластиковый держатель для надёжной фиксации стеклянных полок толщиной S=4 и 5 мм. Защищает стекло от сколов и люфта.",
  palette: SHELF_GLASSHOLDER_PALETTE,
};

const RODHOLDER_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный" },
  { hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" },
  { hex: "#808080", label: "Серый" },
  { hex: "#3e2723", label: "Тёмно-коричневый / Венге" },
  { hex: "#722f37", label: "Красно-коричневый / Вишня" },
  { hex: "#d4a373", label: "Светло-коричневый / Бук" },
  { hex: "#e8d5c4", label: "Бежевый / Песочный" },
];

const RODHOLDER_PROFILE: PartProfile = {
  colorLabel: "Чёрный",
  material: { roughness: 0.7, metalness: 0.0 },
  description:
    "Специализированный пластиковый штангодержатель U-образной формы, предназначенный для надёжной фиксации стандартной овальной штанги в плательных шкафах и гардеробных системах. Деталь обеспечивает жёсткое крепление к боковым стенкам мебельного короба, равномерно распределяя весовую нагрузку от одежды. Конструкция из высокопрочного полимера предотвращает деформацию под тяжестью вещей, гасит металлический лязг при снятии и установке вешалок, а также исключает появление царапин на самой штанге. Широкая цветовая гамма позволяет подобрать фурнитуру в тон внутреннего ЛДСП.",
  palette: RODHOLDER_PALETTE,
};

const EUROVINT_CAP_PALETTE: Swatch[] = [
  { hex: "#fdd835", label: "Жёлтый" },
  { hex: "#1e88e5", label: "Голубой" },
  { hex: "#722f37", label: "Вишня" },
  { hex: "#3e2723", label: "Венге" },
  { hex: "#d4a373", label: "Бук" },
  { hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" },
  { hex: "#e8d5c4", label: "Бежевый" },
  { hex: "#e1c699", label: "Бамбук" },
];

const EUROVINT_CAP_PROFILE: PartProfile = {
  colorLabel: "Жёлтый",
  material: { roughness: 0.35, metalness: 0.0 },
  description:
    "Пластиковая заглушка для маскировки головок евровинтов (конфирматов) при сборке мебели из ЛДСП. Модификация отличается продуманной геометрией: внутреннее углубление в нижней части позволяет полностью «спрятать» выступающую шляпку метиза, а оптимальный диаметр надёжно перекрывает сколы лакового слоя вокруг отверстия. В ассортименте более 20 вариантов, включая базовые монохромные цвета, оттенки под древесную текстуру и яркие решения для детской мебели.",
  palette: EUROVINT_CAP_PALETTE,
};

const SCREW_CAP_PALETTE: Swatch[] = [
  { hex: "#a05a45", label: "Светло-коричневый / Медный" },
  { hex: "#4a2c11", label: "Тёмно-коричневый" },
  { hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" },
  { hex: "#000000", label: "Чёрный" },
  { hex: "#808080", label: "Серый" },
  { hex: "#e8d5c4", label: "Бежевый" },
];

const SCREW_CAP_PROFILE: PartProfile = {
  colorLabel: "Светло-коричневый / Медный",
  material: { roughness: 0.78, metalness: 0.0, texture: "shagreen" },
  description:
    "Универсальная пластиковая заглушка для декоративной маскировки крепёжных узлов. Оснащена центральным фиксирующим штифтом, который плотно вставляется в крестообразный шлиц самореза (PZ или PH), обеспечивая надёжную фиксацию без использования клея. Внешняя полусферическая поверхность имеет лёгкую шагреневую текстуру (матовую шероховатость), благодаря чему деталь не бликует при освещении и органично сливается с текстурой ЛДСП, МДФ или натурального дерева. Эффективно защищает металлический метиз от коррозии и придаёт мебели законченный, эстетичный вид.",
  palette: SCREW_CAP_PALETTE,
};

const ECCENTRIC_CAP_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный" },
  { hex: "#382a24", label: "Тёмно-коричневый / Венге" },
  { hex: "#722f37", label: "Красно-коричневый / Вишня" },
  { hex: "#dcb98a", label: "Светло-бежевый / Песочный" },
  { hex: "#1976d2", label: "Синий" },
];

const ECCENTRIC_CAP_PROFILE: PartProfile = {
  colorLabel: "Чёрный",
  material: { roughness: 0.25, metalness: 0.0 },
  description:
    "Пластиковая декоративная заглушка для эстетичной маскировки металлического барабана эксцентриковой стяжки (минификса). Плоский профиль с аккуратной фаской обеспечивает плотное прилегание к поверхности ЛДСП, делая монтажный узел визуально незаметным и защищая его от попадания пыли и влаги. На внутренней стороне расположен центрирующий цилиндрический штифт, который точно фиксируется в крестообразном шлице эксцентрика, исключая выпадение детали при эксплуатации мебели. Глянцевая фактура и точная колеровка позволяют подобрать заглушку в идеальный тон к ламинированному покрытию фасадов и корпусов.",
  palette: ECCENTRIC_CAP_PALETTE,
};

const KREPSS_PALETTE: Swatch[] = [
  { hex: "#ffffff", label: "Белый", borderColor: "#e5e7eb" },
];

const KREPSS_PROFILE: PartProfile = {
  colorLabel: "Белый",
  material: { roughness: 0.75, metalness: 0.0 },
  description:
    "Профессиональный крепёжный узел «КРЕПСС» для сэндвич-панелей с любым типом наполнителя (PIR, PUR, минеральная вата). Главное технологическое преимущество — 100% терморазрыв: прочный пластиковый корпус полностью прерывает контакт между металлическими элементами, исключая появление мостиков холода, конденсата, промерзания и ржавчины. Крепёж обеспечивает абсолютную свободу проектирования, позволяя монтировать оборудование в любую точку стены или потолка без привязки к скрытому несущему металлокаркасу. Сохраняет идеальную эстетику чистовых помещений без использования нащельников, дополнительных заглушек и подкраски. Оптимален для фиксации сплит-систем, вентиляционных трасс, кабельных лотков, профилей вентфасадов и подвесных потолков на холодильных складах и в вахтовых бытовках.",
  disclaimer:
    "* Внимание: металлическая резьбовая шпилька в комплект поставки не входит. Длина шпильки подбирается и отрезается монтажниками индивидуально под фактическую толщину панели.",
  palette: KREPSS_PALETTE,
};

const SUPPORT_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный" },
  { hex: "#4a2c11", label: "Коричневый" },
];

const SUPPORT_PROFILE: PartProfile = {
  colorLabel: "Чёрный",
  material: { roughness: 0.8, metalness: 0.0 },
  description:
    "Универсальная пластиковая опора для корпусной и мягкой мебели. Обеспечивает надёжную устойчивость конструкции, равномерно распределяет статические нагрузки и защищает напольное покрытие от царапин, вмятин и воздействия влаги при влажной уборке. В товарную матрицу входят стандартные нерегулируемые опоры различной высоты (15, 20, 35 и 50 мм), декоративные шаровые модели (h50 мм) для эстетичных видимых узлов, а также специализированные регулируемые опоры с металлической резьбой М8 (h28 мм) для точной компенсации кривизны пола. Изделия отливаются из сверхпрочного полимера, устойчивого к деформациям и растрескиванию под весом тяжёлых шкафов или диванов.",
  palette: SUPPORT_PALETTE,
};

const METAL_FRAME_SUPPORT_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный" },
];

const METAL_FRAME_SUPPORT_PROFILE: PartProfile = {
  colorLabel: "Чёрный",
  material: { roughness: 0.85, metalness: 0.0 },
  description:
    "Специализированный пластиковый подпятник (опора-заглушка) для мебели на металлическом каркасе, включая школьные парты, стулья, столы и изделия в стиле лофт. Главная функция — надёжная защита напольных покрытий (ламината, линолеума, паркета) от царапин, продавливания и прямого контакта с жёстким металлическим профилем. Благодаря продуманной системе фиксации (плотный охват трубы или внутренние рёбра жёсткости), подпятник прочно держится на ножке мебели и не слетает при частом перемещении стульев. Отливается из износостойкого полимера, рассчитанного на постоянные статические и динамические нагрузки, а также стойкого к истиранию.",
  palette: METAL_FRAME_SUPPORT_PALETTE,
};

const TUBE_PLUG_PALETTE: Swatch[] = [
  { hex: "#000000", label: "Чёрный (Базовый)" },
];

const RECT_TUBE_PLUG_PROFILE: PartProfile = {
  colorLabel: "Чёрный (Базовый)",
  material: { roughness: 0.82, metalness: 0.0 },
  description:
    "Внутренняя пластиковая заглушка прямоугольного сечения для профильных труб. Обеспечивает герметизацию торца трубы, защищая внутреннюю полость от влаги, мусора и скрытой коррозии. Оснащена эластичными жаберными упорами (рёбрами жёсткости) для плотной посадки и автоматической компенсации расхождений в толщине металлической стенки. Придаёт металлоконструкции завершённый, травмобезопасный вид без необходимости заваривания торцов.",
  palette: TUBE_PLUG_PALETTE,
};

const SQUARE_TUBE_PLUG_PROFILE: PartProfile = {
  colorLabel: "Чёрный (Базовый)",
  material: { roughness: 0.82, metalness: 0.0 },
  description:
    "Универсальная квадратная заглушка-вкладыш для декоративного торцевания профильного проката. Монтируется забивным способом (киянкой) без использования клея. Боковые фиксирующие гофры гарантируют надёжное удержание детали внутри профиля даже при резких перепадах температур и вибрационных нагрузках. Идеальное технологическое решение для производства стеллажных систем, заборов, рекламных стоек и каркасной мебели на металлокаркасе.",
  palette: TUBE_PLUG_PALETTE,
};

const ROUND_TUBE_PLUG_PROFILE: PartProfile = {
  colorLabel: "Чёрный (Базовый)",
  material: { roughness: 0.82, metalness: 0.0 },
  description:
    "Круглая пластиковая заглушка для стальных и алюминиевых труб. Формирует аккуратный, скруглённый торец и надёжно защищает напольные покрытия от порезов и царапин в случаях, когда труба выступает в роли мебельной опоры. Многореберная эластичная ножка центрирует деталь при монтаже и обеспечивает тугую посадку в трубы с различным ГОСТом толщины стенки (от 1.0 до 3.0 мм).",
  palette: TUBE_PLUG_PALETTE,
};

/** Усиленная крышка для канистры — независимый профиль (не связан с сэндвич-панелями). */
const CANISTER_CAP_PROFILE: PartProfile = {
  colorLabel: "Чёрный",
  material: { roughness: 0.65, metalness: 0.0 },
  description:
    "Усиленная пластиковая крышка для промышленных и бытовых канистр, рассчитанная на экстремальные условия эксплуатации. Отличается увеличенной толщиной стенки и модифицированным профилем резьбы, что полностью исключает срыв при сильном затягивании и гарантирует многократное (вечное) использование. Абсолютная герметичность достигается за счет плотного внутреннего обтюратора (конуса).",
  palette: [{ hex: "#000000", label: "Чёрный" }],
};

/** Семейство «Тетрагедрон» — утилитарный матовый промышленный пластик. */
const TETRAHEDRON_PROFILE: PartProfile = {
  colorLabel: "Чёрный",
  material: { roughness: 0.85, metalness: 0.0 },
  description:
    "Технологические пластиковые детали (тетрагедроны) для производственных линий по выпуску сэндвич-панелей. Разработаны специально для обеспечения правильной геометрии и технологического процесса на заводах-изготовителях панелей. Литьё из высокопрочного чёрного пластика с точным соблюдением допусков.",
  palette: [{ hex: "#000000", label: "Чёрный" }],
};

const SKU_PROFILES: Record<string, PartProfile> = {
  "KAN-CAP-R": CANISTER_CAP_PROFILE,
  "TG-080": TETRAHEDRON_PROFILE,
  "TG-100": TETRAHEDRON_PROFILE,
  "TG-150": TETRAHEDRON_PROFILE,
  "MK-LH": DOVETAIL_PROFILE,
  "MK-LHZ": DOVETAIL_CAP_PROFILE,
  "MK-LD": LATHOLDER_PROFILE,
  "MK-SD": GLASSHOLDER_PROFILE,
  "MK-UG": ANGLE_BRACKET_PROFILE,
  "STK-POL-01": SHELF_GLASSHOLDER_PROFILE,
  "MK-SHD": RODHOLDER_PROFILE,
  "ZGD-EV": EUROVINT_CAP_PROFILE,
  "ZGD-SM": SCREW_CAP_PROFILE,
  "ZGD-EX": ECCENTRIC_CAP_PROFILE,
  "OP-H15": SUPPORT_PROFILE,
  "OP-H20": SUPPORT_PROFILE,
  "OP-H35": SUPPORT_PROFILE,
  "OP-H50": SUPPORT_PROFILE,
  "OP-SH-H50": SUPPORT_PROFILE,
  "OP-M6-H28": SUPPORT_PROFILE,
  "OP-PM-20": METAL_FRAME_SUPPORT_PROFILE,
  "OP-PM-25": METAL_FRAME_SUPPORT_PROFILE,
  "OP-P-STD": METAL_FRAME_SUPPORT_PROFILE,
  "ZGV-20x40": RECT_TUBE_PLUG_PROFILE,
  "ZGV-40x60": RECT_TUBE_PLUG_PROFILE,
  "ZGV-15x15": SQUARE_TUBE_PLUG_PROFILE,
  "ZGV-20x20": SQUARE_TUBE_PLUG_PROFILE,
  "ZGV-25x25": SQUARE_TUBE_PLUG_PROFILE,
  "ZGV-40x40": SQUARE_TUBE_PLUG_PROFILE,
  "ZGV-60x60": SQUARE_TUBE_PLUG_PROFILE,
  "ZGV-80x80": SQUARE_TUBE_PLUG_PROFILE,
  "ZGV-100x100": SQUARE_TUBE_PLUG_PROFILE,
  "ZGV-D20": ROUND_TUBE_PLUG_PROFILE,
  "ZGV-D22": ROUND_TUBE_PLUG_PROFILE,
  "ZGV-D25": ROUND_TUBE_PLUG_PROFILE,
  "KREPSS-PRO": KREPSS_PROFILE,
};




const TETRAHEDRON_DESCRIPTION =
  "Технологические пластиковые детали (тетрагедроны) для производственных линий по выпуску сэндвич-панелей. Разработаны специально для обеспечения правильной геометрии и технологического процесса на заводах-изготовителях панелей. Литьё из высокопрочного чёрного пластика с точным соблюдением допусков.";

const PART_COLOR_HEX = "#000000" as const;

const PROFILES: Record<string, PartProfile> = {
  // Кляймер ДПК — матовый уличный пластик, УФ-стойкий
  "Комплектующие для ДПК": {
    colorLabel: "Чёрный (УФ-стойкий)",
    material: { roughness: 0.88, metalness: 0.0 },
    description:
      "Пластиковые комплектующие для монтажа террасной доски и заборов из ДПК. Кляймеры для скрытого монтажа ДПК (обеспечивают надёжную фиксацию и правильный технологический зазор). Материал устойчив к перепадам температур, влаге и УФ-лучам (не трескается на морозе).",
  },
  // Тетрагедроны — литой промышленный пластик
  "Для производства сэндвич-панелей": {
    colorLabel: "Чёрный",
    material: { roughness: 0.85, metalness: 0.0 },
    description: TETRAHEDRON_DESCRIPTION,
    palette: [{ hex: "#000000", label: "Чёрный" }],
  },
};

const DEFAULT_PROFILE: PartProfile = {
  colorLabel: "Чёрный",
  material: { roughness: 0.85, metalness: 0.0 },
  description: TETRAHEDRON_DESCRIPTION,
};

export type ColorSwatch = Swatch;

/** Палитра позиции для табличной сетки: null — у SKU нет вариаций цвета. */
export function paletteForProduct(p: { sku: string; category: string }): Swatch[] | null {
  const prof = SKU_PROFILES[p.sku] ?? PROFILES[p.category] ?? null;
  return prof?.palette && prof.palette.length > 1 ? prof.palette : null;
}

/** Базовый цвет позиции без палитры (для сквозной передачи в корзину). */
export function baseColorForProduct(p: { sku: string; category: string }) {
  const prof = SKU_PROFILES[p.sku] ?? PROFILES[p.category] ?? DEFAULT_PROFILE;
  const sw = prof.palette?.[0];
  return { label: sw?.label ?? prof.colorLabel, hex: sw?.hex ?? PART_COLOR_HEX };
}

/** Маркетинговое описание позиции — используется в JSON-LD микроразметке. */
export function descriptionForProduct(p: { sku: string; category: string }): string {
  const service = SERVICE_PROFILES[p.sku];
  if (service) return service.description;
  const prof = SKU_PROFILES[p.sku] ?? PROFILES[p.category] ?? DEFAULT_PROFILE;
  return prof.description;
}



type ServiceProfile = {
  description: string;
  specs: [string, string][];
  cta: string;
};

const SERVICE_PROFILES: Record<string, ServiceProfile> = {
  "SRV-INJ": {
    description:
      "Полный цикл контрактного производства пластиковых изделий на современных термопластавтоматах (ТПА). Берём на себя все этапы: от аудита 3D-модели и проектирования пресс-формы до серийного литья и упаковки готовой продукции. Обеспечиваем строгий контроль качества, соблюдение допусков и стабильность геометрии в каждой партии.",
    specs: [
      ["Парк оборудования", "6 современных термопластавтоматов (ТПА) для бесперебойного выпуска"],
      ["Усилие смыкания", "От 90 до 200 тонн"],
      ["Объём впрыска", "От 120 до 450 см³"],
      ["Материалы", "ПП (PP), ПЭ (PE), ПС (PS), АБС (ABS), ПА (PA), ПОМ (POM) и другие под ваши требования"],
    ],
    cta: "Запросить расчёт",
  },
  "SRV-RE3D": {
    description:
      "Обратное проектирование сломанных, изношенных или уникальных деталей без исходных чертежей. Проводим высокоточное оптическое 3D-сканирование физического образца с последующим построением твердотельной параметрической CAD-модели. Готовим полную конструкторскую документацию, готовую для ЧПУ-фрезеровки, 3D-печати или производства пресс-формы.",
    specs: [
      ["Шаг 1 — 3D-сканирование", "Снимаем оптические/лазерные сканы с объекта любой сложности"],
      ["Шаг 2 — Анализ и корректировка", "Восстанавливаем изношенные поверхности, сломанные зубья или крепежи"],
      ["Шаг 3 — CAD-моделирование", "Параметрическая твердотельная модель (STEP, IGES), готовая к производству"],
      ["Шаг 4 — Документация", "Чертежи по ЕСКД (DWG, PDF)"],
      ["Шаг 5 — Тестовая 3D-печать", "Физическая копия для проверки собираемости узла до запуска серии"],
    ],
    cta: "Оставить заявку",
  },
  "SRV-FDM": {
    description:
      "Оперативно изготовим детали сложной геометрии методом промышленной FDM-печати. Мы не занимаемся сувенирами — мы создаём прочные, функциональные элементы, готовые к реальным механическим нагрузкам, трению и агрессивным средам.",
    specs: [
      ["Инженерные пластики", "ABS, PETG, PC (Поликарбонат), PA (Нейлон) — для корпусов и мастер-моделей"],
      ["Спецматериалы", "Угленаполненные и стеклонаполненные композиты (жёсткость, прочность на разрыв), гибкий TPU (уплотнители, прокладки, демпферы)"],
      ["Исходные данные", "Печать по вашим 3D-моделям (STL, STEP). Нет исходников — сделаем реверс-инжиниринг"],
      ["Применение", "Функциональные прототипы, корпуса, оснастка"],
    ],
    cta: "Запросить расчёт",
  },
};

const loadCadViewer = createClientOnlyFn(async () => {
  const module = await import("@/components/catalog/cad-viewer");
  return module.default as ComponentType<CadViewerProps>;
});


export function ProductSheet({
  product,
  onClose,
  initialColorHex,
  onColorChange,
}: {
  product: Product | null;
  onClose: () => void;
  /** HEX цвета из URL (?color=...) — карточка открывается с ним предвыбранным. */
  initialColorHex?: string | undefined;
  /** Синхронизация выбранного цвета с адресной строкой. */
  onColorChange?: ((color: { label: string; hex: string }) => void) | undefined;
}) {
  const [city, setCity] = useState<CityValue>({ city: "Москва", fiasId: null });
  const [batch, setBatch] = useState(1000);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [calcState, setCalcState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const assets = useAssetGroups();
  const assetGroup = product ? assets.get(product.sku) : undefined;
  const service = product ? SERVICE_PROFILES[product.sku] : undefined;

  const profile = product
    ? SKU_PROFILES[product.sku] ?? PROFILES[product.category] ?? DEFAULT_PROFILE
    : DEFAULT_PROFILE;
  const [swatchIndex, setSwatchIndex] = useState(0);
  useEffect(() => {
    if (!product) return;
    const prof = SKU_PROFILES[product.sku] ?? PROFILES[product.category] ?? DEFAULT_PROFILE;
    const wanted = initialColorHex?.toLowerCase();
    const idx = wanted ? (prof.palette ?? []).findIndex((s) => s.hex.toLowerCase() === wanted) : -1;
    setSwatchIndex(idx >= 0 ? idx : 0);
  }, [product?.sku, initialColorHex]);
  // Позиции без палитры получают один базовый свотч — UI везде одинаковый.
  const swatches: Swatch[] =
    profile.palette && profile.palette.length
      ? profile.palette
      : [{ hex: PART_COLOR_HEX, label: profile.colorLabel }];
  const activeSwatch = swatches[swatchIndex] ?? swatches[0];
  const partColor = activeSwatch?.hex ?? PART_COLOR_HEX;
  const partMaterial = activeSwatch
    ? {
        ...profile.material,
        ...(activeSwatch.roughness !== undefined ? { roughness: activeSwatch.roughness } : {}),
        opacity: activeSwatch.opacity ?? 1,
      }
    : profile.material;
  const addLine = useCart((st) => st.addLine);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [CadViewer, setCadViewer] = useState<ComponentType<CadViewerProps> | null>(null);

  useEffect(() => {
    let active = true;
    void loadCadViewer().then((Viewer) => {
      if (active) setCadViewer(() => Viewer);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!product) return;
    trackViewItem({ sku: product.sku, name: product.name, price: product.price });
  }, [product]);

  const debouncedCity = useDebounce(city.city, 600);

  const parcel = useMemo(
    () => ({
      totalWeight: +((product?.weight ?? 0) * batch).toFixed(3),
      totalVolume: +((product?.volume ?? 0) * batch).toFixed(4),
    }),
    [product, batch],
  );

  useEffect(() => {
    const dest = debouncedCity.trim();
    if (!product || dest.length < 2) {
      setQuotes([]);
      setCalcState("idle");
      return;
    }
    setQuotes([]);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setCalcState("failed");
      return;
    }
    setCalcState("loading");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    (async () => {
      try {
        const res = await fetch("/api/shipping-calc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destination: { city: dest, fias_id: city.fiasId },
            parcel,
          }),
          signal: ctrl.signal,
        });
        const json = (await res.json()) as { quotes?: ShippingQuote[] };
        if (!res.ok || !json.quotes?.length) throw new Error("no quotes");
        setQuotes(json.quotes);
        setCalcState("ready");
      } catch {
        setCalcState("failed");
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [debouncedCity, city.fiasId, parcel, product]);

  const logistics = quotes;

  const jsonLd = product
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        sku: product.sku,
        category: `Каталог/${product.category}`,
        material: product.material,
        weight: { "@type": "QuantitativeValue", value: product.weight, unitCode: "KGM" },
        offers: {
          "@type": "Offer",
          price: product.price,
          priceCurrency: "RUB",
          validFrom: "2026-01-01",
          availability:
            product.stock.qty > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/PreOrder",
          shippingDetails: {
            "@type": "OfferShippingDetails",
            shippingRate: {
              "@type": "MonetaryAmount",
              value: logistics[0]?.price ?? 0,
              currency: "RUB",
            },
            shippingDestination: { "@type": "DefinedRegion", addressCountry: "RU" },
          },
          hasMerchantReturnPolicy: {
            "@type": "MerchantReturnPolicy",
            applicableCountry: "RU",
            returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
            merchantReturnDays: 14,
          },
        },
        aggregateRating: { "@type": "AggregateRating", ratingValue: 4.8, reviewCount: 126 },
      }
    : null;

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[90dvh] max-w-6xl overflow-y-auto overscroll-contain max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:max-h-[92dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-t-2xl max-md:rounded-b-none max-md:p-4 max-md:pb-[env(safe-area-inset-bottom)] max-md:data-[state=closed]:slide-out-to-bottom max-md:data-[state=open]:slide-in-from-bottom"
      >
        {/* Индикатор шторки: подсказывает жест «свайп вниз» на мобильных */}
        <div aria-hidden className="mx-auto -mt-1 h-1.5 w-12 shrink-0 rounded-full bg-border md:hidden" />
        {product && service && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-extrabold text-foreground">
                {product.name}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {product.sku}
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-6">
              <CollapsibleText text={service.description} />

              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border pt-6 text-sm sm:grid-cols-2">
                {service.specs.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 font-medium text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>

              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="mt-2 inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-sm bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {service.cta}
              </button>
            </div>

            <BulkRequestDialog
              product={product}
              open={bulkOpen}
              onClose={() => setBulkOpen(false)}
            />
          </>
        )}
        {product && !service && (
          <>

            <DialogHeader>
              <DialogTitle className="text-xl font-extrabold text-foreground">
                {product.name}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {product.sku}
                </span>
              </DialogTitle>
            </DialogHeader>

            <CollapsibleText text={profile.description} className="-mt-1" />

            {profile.disclaimer && (
              <div className="mt-4 max-w-[70ch] rounded-md border-l-4 border-amber-400 bg-amber-50/50 p-3 text-sm leading-[1.5] text-gray-700">
                {profile.disclaimer}
              </div>
            )}

            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <ClientOnly fallback={<CadViewerPlaceholder />}>
                  {CadViewer ? (
                    <CadViewer
                      glbUrl={product.engineering_assets.model_glb_url}
                      category={product.category}
                      color={partColor}
                      material={partMaterial}
                    />
                  ) : (
                    <CadViewerPlaceholder />
                  )}
                </ClientOnly>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Цвет детали
                  </p>
                  {/* Единый дизайн-код каталога: компактная сетка свотчей + тултип. */}
                  <TooltipProvider delayDuration={120}>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {swatches.map((sw, i) => (
                        <Tooltip key={sw.hex + sw.label}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={sw.label}
                              aria-pressed={i === swatchIndex}
                              onClick={() => {
                                setSwatchIndex(i);
                                onColorChange?.({ label: sw.label, hex: sw.hex });
                              }}
                              className={`size-6 cursor-pointer rounded-full border transition-all duration-200 ${
                                i === swatchIndex
                                  ? "border-foreground ring-2 ring-gray-400 ring-offset-2"
                                  : "border-border hover:border-foreground/60"
                              }`}
                              style={
                                sw.opacity
                                  ? {
                                      backgroundImage:
                                        "linear-gradient(135deg, #ffffff 45%, #cfcfcf 45%, #cfcfcf 55%, #ffffff 55%)",
                                    }
                                  : {
                                      backgroundColor: sw.hex,
                                      ...(sw.borderColor ? { borderColor: sw.borderColor } : {}),
                                    }
                              }
                            />
                          </TooltipTrigger>
                          <TooltipContent>{sw.label}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </TooltipProvider>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  Модель сжата Draco · вращение мышью, зум колесом. Геометрия совпадает с
                  отливкой артикула {product.sku}.
                </p>
              </div>


              <div>
                <dl className="scrollbar-thin grid max-h-[350px] grid-cols-2 gap-x-6 gap-y-3 overflow-y-auto border-b border-border pb-6 pr-1 text-sm">
                  {normalizeSpecs(
                    (product.specRows
                      ? [
                          ...product.specRows,
                          ["Габариты", product.dims],
                          ["Вес детали", `${(product.weight * 1000).toFixed(0)} г`],
                          [
                            "Наличие",
                            product.stock.qty > 0
                              ? `${product.stock.qty.toLocaleString("ru-RU")} шт`
                              : product.stock.lead!,
                          ],
                        ]
                      : [
                          ["Материал", product.material],
                          ["Габариты", product.dims],
                          ["Нагрузка", product.load],
                          ["Стандарт", product.gost],
                          ...(product.features
                            ? ([["Особенности", product.features]] as [string, string][])
                            : []),
                          ["Вес детали", `${(product.weight * 1000).toFixed(0)} г`],
                          [
                            "Наличие",
                            product.stock.qty > 0
                              ? `${product.stock.qty.toLocaleString("ru-RU")} шт`
                              : product.stock.lead!,
                          ],
                        ]) as [string, string][],
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>

                {assetGroup?.description && (
                  <p className="mt-5 text-sm leading-[1.65] text-foreground">
                    {assetGroup.description}
                  </p>
                )}

                <div className="mt-6 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    CAD-ассеты для проектировщика · без регистрации
                  </p>
                  {(
                    [
                      ["step", "Скачать модель STEP", "Твердотельная 3D", Layers, product.engineering_assets.model_step_url],
                      ["dwg", "Скачать чертёж DWG", "AutoCAD 2D", Ruler, product.engineering_assets.model_dwg_url],
                      ["pdf", "Технический паспорт PDF", "Схема, ГОСТы, допуски", FileText, product.engineering_assets.passport_pdf_url],
                    ] as const
                  ).map(([fmt, label, hint, Icon, href]) => (
                    <a
                      key={fmt}
                      href={href}
                      download
                      onClick={() => trackCadDownload(product.sku, fmt)}
                      className="flex items-center gap-3 rounded-sm border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className="hidden shrink-0 text-xs font-normal text-muted-foreground sm:inline">
                        {hint}
                      </span>
                      <Download className="size-4 shrink-0" strokeWidth={1.75} />
                    </a>
                  ))}
                </div>

                <div className="mt-6 rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-2">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Truck className="size-4" strokeWidth={1.5} /> Логистика на партию
                    </p>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <CityInput value={city} onChange={setCity} />
                      <input
                        value={batch}
                        onChange={(e) =>
                          setBatch(Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))
                        }
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-label="Количество, шт"
                        className="mt-3 h-11 w-[104px] shrink-0 rounded-sm border border-[#D1D5DB] px-3 text-base outline-none focus:border-foreground"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Расчётный груз: {parcel.totalWeight.toLocaleString("ru-RU")} кг ·{" "}
                      {parcel.totalVolume.toLocaleString("ru-RU")} м³
                    </p>
                  </div>

                  {calcState === "loading" && (
                    <ul className="mt-3 space-y-2" aria-busy="true">
                      {[0, 1].map((i) => (
                        <li key={i} className="flex justify-between gap-4">
                          <span className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                          <span className="h-4 w-16 animate-pulse rounded bg-muted" />
                        </li>
                      ))}
                    </ul>
                  )}

                  {calcState === "failed" && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Расчет недоступен. Стоимость уточнит менеджер.
                    </p>
                  )}

                  {calcState === "ready" && (
                    <ul className="mt-3 space-y-2 text-sm">
                      {logistics.map((l) => (
                        <li key={l.carrier} className="flex justify-between gap-4">
                          <span className="text-muted-foreground">
                            {l.label} · {l.days} дн.
                          </span>
                          <span className="font-medium tabular-nums text-foreground">
                            {l.price.toLocaleString("ru-RU")} ₽
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {calcState === "idle" && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Укажите город — рассчитаем доставку по реальным тарифам ТК.
                    </p>
                  )}
                </div>

                {/* Мобильный CTA приклеен к низу шторки: цена и корзина всегда под большим пальцем */}
                <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border bg-background px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 md:static md:mx-0 md:mt-0 md:border-0 md:bg-transparent md:p-0">
                <button
                  type="button"
                  onClick={() => {
                    const qty = Math.max(1, Math.floor(batch) || 1);
                    addLine(
                      product.sku,
                      qty,
                      undefined,
                      activeSwatch
                        ? { label: activeSwatch.label, hex: activeSwatch.hex }
                        : undefined,
                    );
                    toast.success(
                      `${product.sku} — ${qty.toLocaleString("ru-RU")} шт добавлено в корзину${
                        activeSwatch ? ` (${activeSwatch.label})` : ""
                      }`,
                    );
                  }}
                  className="inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-sm bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:opacity-90 md:mt-6"
                >
                  В корзину · {Math.max(1, Math.floor(batch) || 1).toLocaleString("ru-RU")} шт
                </button>

                </div>

                <button
                  type="button"
                  onClick={() => setBulkOpen(true)}
                  className="mt-4 inline-flex min-h-[44px] cursor-pointer items-center rounded-sm px-1 text-left text-sm font-medium text-foreground underline-offset-4 transition-colors duration-200 hover:text-primary hover:underline"
                >
                  Запросить спец. условия на партию от{" "}
                  {(product.tier2Qty || 50000).toLocaleString("ru-RU")} шт →
                </button>
              </div>
            </div>

            <BulkRequestDialog
              product={product}
              open={bulkOpen}
              onClose={() => setBulkOpen(false)}
            />

            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CadViewerPlaceholder() {
  return (
    <div
      aria-busy="true"
      aria-label="Загрузка 3D-модели"
      className="grid h-72 animate-pulse place-items-center rounded-lg bg-muted font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
    >
      Инициализация WebGL...
    </div>
  );
}

/** Длинные описания сворачиваются, чтобы характеристики и кнопка заказа не уезжали за экран. */
function CollapsibleText({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (open) return;
      setClamped(el.scrollHeight - el.clientHeight > 4);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [text, open]);

  return (
    <div className={className}>
      <p
        ref={ref}
        className={`max-w-[70ch] text-sm leading-[1.6] text-muted-foreground ${
          open ? "" : "line-clamp-5"
        }`}
      >
        {text}
      </p>
      {(clamped || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 min-h-[36px] cursor-pointer text-sm font-medium text-foreground underline underline-offset-4"
        >
          {open ? "Свернуть" : "Читать далее..."}
        </button>
      )}
    </div>
  );
}


/** Убирает дубли ключей и унифицирует название параметра размеров. */
function normalizeSpecs(rows: [string, string][]): [string, string][] {
  const out: [string, string][] = [];
  const seen = new Set<string>();
  for (const [rawKey, rawValue] of rows) {
    if (!rawValue) continue;
    const isDims = /габарит|размер/i.test(rawKey);
    const key = isDims ? "Габариты" : rawKey.trim();
    const id = key.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    // Значение не должно повторять ключ («Габариты: Габариты 20×20»)
    const value = String(rawValue).replace(new RegExp(`^\\s*${key}\\s*[:—-]?\\s*`, "i"), "").trim();
    out.push([key, value || String(rawValue)]);
  }
  return out;
}
