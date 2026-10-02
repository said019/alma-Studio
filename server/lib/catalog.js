// Catálogo inicial que se siembra en una instalación nueva (tablas vacías; ver
// server/lib/catalogSeed.js). Con filas existentes no se toca nada: el
// catálogo real del estudio se captura en el panel.

export const CATALOG_CLASS_TYPES = [
  { name: "Pilates Reformer", category: "reformer_tower", capacity: 4, duration_min: 50, color: "#76214D", sort_order: 1 },
  { name: "Pilates Tower",    category: "reformer_tower", capacity: 4, duration_min: 50, color: "#8A4A6B", sort_order: 2 },
  { name: "Pilates Mat",      category: "studio",         capacity: 8, duration_min: 50, color: "#A48D78", sort_order: 3 },
  { name: "Barre",            category: "studio",         capacity: 8, duration_min: 50, color: "#9C8E72", sort_order: 4 },
  { name: "Sculpt",           category: "studio",         capacity: 8, duration_min: 50, color: "#C0A688", sort_order: 5 },
];

// Horas de inicio publicadas. De 11 a 16 h LV también hay sesiones especiales.
export const CATALOG_SCHEDULE_SLOTS = ["6:00 am","7:00 am","8:00 am","9:00 am","10:00 am","11:00 am","12:00 pm","1:00 pm","2:00 pm","3:00 pm","4:00 pm","5:00 pm","6:00 pm","7:00 pm","8:00 pm"];
export const CATALOG_SCHEDULE_DAYS = [1,2,3,4,5,6,0];
export const CATALOG_SCHEDULE_BY_DAY = Object.fromEntries(CATALOG_SCHEDULE_DAYS.map(day=>[day,day===6?["8:00 am","9:00 am","10:00 am","11:00 am","12:00 pm"]:day===0?["8:00 am","9:00 am","10:00 am","11:00 am"]:CATALOG_SCHEDULE_SLOTS]));

// Catálogo autorizado HIVE, octubre de 2026. Vigencia desde compra.
const baseRules = { allowed_weekdays: [0,1,2,3,4,5,6], daily_class_limit: null, requires_student_id: false, guest_passes: 0, guest_pass_period: "membership", complimentary_coffee_per_day: 0, billing_period: "one_time", commitment_months: 0, auto_renew: false, transferable: false, extendable: false };
export const CATALOG_PLANS = [
  { name:"1 Clase", price:330, opening_price:290, class_limit:1 },
  { name:"4 Clases", price:1200, opening_price:1080, class_limit:4 },
  { name:"10 Clases", price:2700, opening_price:2200, class_limit:10 },
  { name:"20 Clases", price:4400, opening_price:4000, class_limit:20, duration_days:60 },
  { name:"Plan mensual", price:4800, opening_price:4200, class_limit:null, rules:{daily_class_limit:1,guest_passes:2}, description:"1 sesión por día y 2 guest pass. Vigencia: 30 días desde la compra." },
  { name:"Plan anual / pago mensual", price:4200, opening_price:3900, class_limit:null, rules:{daily_class_limit:2,guest_passes:2,guest_pass_period:"month",complimentary_coffee_per_day:1,billing_period:"month",commitment_months:12,auto_renew:true,payment_url:"https://mpago.la/1YY3tpp",opening_payment_url:"https://mpago.la/1HWyxU1"}, description:"Compromiso anual con pago y renovación mensual automática. 2 sesiones por día, 2 guest pass por mes y 1 café regular de cortesía por día. Activación de cada periodo sujeta a pago confirmado." },
  { name:"Horario especial", price:250, opening_price:null, class_limit:1, afternoon_only:true, rules:{allowed_weekdays:[1,2,3,4,5],booking_start_time:"11:00",booking_end_time:"16:00"}, description:"1 sesión de lunes a viernes, de 11:00 a 16:00. Vigencia: 30 días desde la compra." },
  { name:"Promo estudiante", price:250, opening_price:null, class_limit:1, rules:{requires_student_id:true}, description:"1 sesión, cualquier horario y todos los días, presentando credencial estudiantil vigente. Vigencia: 30 días desde la compra." },
  { name:"Personalizado", price:500, opening_price:null, class_limit:1, personal_only:true, rules:{allowed_weekdays:[1,2,3,4,5],booking_start_time:"11:00",booking_end_time:"16:00"}, description:"Sesión individual 1 a 1 de lunes a viernes de 11:00 a 16:00. Vigencia: 30 días desde la compra." },
].map((p,i)=>({duration_days:30,class_category:"reformer_tower",morning_only:false,afternoon_only:false,personal_only:false,is_non_repeatable:false,repeat_key:null,is_non_transferable:true,sort_order:i+1,description:`${p.class_limit} sesión(es). Vigencia: ${p.duration_days||30} días naturales desde la compra. Personal e intransferible; sin prórroga.`,...p,rules:{...baseRules,...p.rules}}));
