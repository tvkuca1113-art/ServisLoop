/**
 * Izmišljeni podaci za prikaz proizvoda na marketing stranici.
 *
 * Sve firme, imena, adrese, telefoni i e-adrese su izmišljeni. Domene koriste
 * `.primjer.ba` koji ne postoji, a brojevi su iz rezervisanog opsega za primjere.
 * Nijedan podatak ne pripada stvarnoj osobi ni firmi.
 *
 * Ovi podaci se koriste ISKLJUČIVO za vizualni prikaz na javnim stranicama.
 * Demo organizacija u aplikaciji ima svoje, odvojene podatke u bazi
 * (vidi `supabase/seed`).
 */

export const PREVIEW_COMPANY = 'TermoPlus Servis d.o.o.'

export interface PreviewDevice {
  id: string
  customer: string
  city: string
  type: string
  model: string
  serial: string
  nextService: string
  status: 'dospijeva' | 'kasni' | 'uredno' | 'rezervisano'
  priceKm: number
}

export const PREVIEW_DEVICES: PreviewDevice[] = [
  {
    id: 'UR-1042',
    customer: 'Pekara Zlatni Klas',
    city: 'Sarajevo',
    type: 'Rashladna vitrina',
    model: 'FrigoLine RV-220',
    serial: 'FL22••••81',
    nextService: '12.04.2027.',
    status: 'dospijeva',
    priceKm: 140,
  },
  {
    id: 'UR-0987',
    customer: 'Amila Hodžić',
    city: 'Ilidža',
    type: 'Klima uređaj',
    model: 'AeroTherm ST-12',
    serial: 'AT12••••04',
    nextService: '28.03.2027.',
    status: 'kasni',
    priceKm: 70,
  },
  {
    id: 'UR-1130',
    customer: 'Ordinacija Vita',
    city: 'Zenica',
    type: 'Toplotna pumpa',
    model: 'NordHeat 9',
    serial: 'NH09••••55',
    nextService: '05.05.2027.',
    status: 'rezervisano',
    priceKm: 180,
  },
  {
    id: 'UR-0771',
    customer: 'Emir Begić',
    city: 'Tuzla',
    type: 'Kotao',
    model: 'CaloMax 24K',
    serial: 'CM24••••19',
    nextService: '19.06.2027.',
    status: 'uredno',
    priceKm: 95,
  },
  {
    id: 'UR-1208',
    customer: 'Hotel Kamena Ćuprija',
    city: 'Mostar',
    type: 'Ventilaciona jedinica',
    model: 'VentPro 400',
    serial: 'VP40••••63',
    nextService: '02.04.2027.',
    status: 'dospijeva',
    priceKm: 220,
  },
]

export interface PreviewService {
  id: string
  device: string
  customer: string
  technician: string
  date: string
  result: 'završen' | 'u toku' | 'čeka dio'
  priceKm: number
}

export const PREVIEW_SERVICES: PreviewService[] = [
  {
    id: 'SL-2027-000412',
    device: 'Klima uređaj · AeroTherm ST-12',
    customer: 'Amila Hodžić',
    technician: 'Damir Suljić',
    date: '18.03.2027.',
    result: 'završen',
    priceKm: 70,
  },
  {
    id: 'SL-2027-000411',
    device: 'Kotao · CaloMax 24K',
    customer: 'Emir Begić',
    technician: 'Nedim Karić',
    date: '17.03.2027.',
    result: 'čeka dio',
    priceKm: 95,
  },
  {
    id: 'SL-2027-000410',
    device: 'Toplotna pumpa · NordHeat 9',
    customer: 'Ordinacija Vita',
    technician: 'Damir Suljić',
    date: '16.03.2027.',
    result: 'završen',
    priceKm: 180,
  },
  {
    id: 'SL-2027-000409',
    device: 'Rashladna vitrina · FrigoLine RV-220',
    customer: 'Pekara Zlatni Klas',
    technician: 'Nedim Karić',
    date: '14.03.2027.',
    result: 'u toku',
    priceKm: 140,
  },
]

export interface PreviewBooking {
  id: string
  customer: string
  device: string
  slot: string
  origin: 'podsjetnik' | 'QR kod' | 'prijava kvara'
  state: 'potvrđeno' | 'čeka dodjelu'
}

export const PREVIEW_BOOKINGS: PreviewBooking[] = [
  {
    id: 'RZ-3391',
    customer: 'Ordinacija Vita',
    device: 'Toplotna pumpa NordHeat 9',
    slot: 'uto, 06.04. · 09:00–10:30',
    origin: 'podsjetnik',
    state: 'potvrđeno',
  },
  {
    id: 'RZ-3390',
    customer: 'Hotel Kamena Ćuprija',
    device: 'Ventilaciona jedinica VentPro 400',
    slot: 'sri, 07.04. · 11:00–13:00',
    origin: 'QR kod',
    state: 'čeka dodjelu',
  },
  {
    id: 'RZ-3388',
    customer: 'Pekara Zlatni Klas',
    device: 'Rashladna vitrina FrigoLine RV-220',
    slot: 'pet, 09.04. · 08:00–09:30',
    origin: 'prijava kvara',
    state: 'potvrđeno',
  },
]

export interface PreviewWorkOrder {
  id: string
  title: string
  technician: string
  priority: 'hitno' | 'normalno' | 'nisko'
  status: 'dodijeljen' | 'u toku' | 'čeka dio' | 'završen'
  due: string
}

export const PREVIEW_WORK_ORDERS: PreviewWorkOrder[] = [
  {
    id: 'RN-2211',
    title: 'Redovni servis · Klima AeroTherm ST-12',
    technician: 'Damir Suljić',
    priority: 'normalno',
    status: 'u toku',
    due: 'danas · 14:00',
  },
  {
    id: 'RN-2210',
    title: 'Prijava kvara · Rashladna vitrina ne hladi',
    technician: 'Nedim Karić',
    priority: 'hitno',
    status: 'dodijeljen',
    due: 'danas · 16:30',
  },
  {
    id: 'RN-2208',
    title: 'Zamjena ventila · Kotao CaloMax 24K',
    technician: 'Nedim Karić',
    priority: 'normalno',
    status: 'čeka dio',
    due: 'sut, 09:00',
  },
  {
    id: 'RN-2205',
    title: 'Redovni servis · Toplotna pumpa NordHeat 9',
    technician: 'Damir Suljić',
    priority: 'nisko',
    status: 'završen',
    due: '16.03. · 10:00',
  },
]

export const PREVIEW_METRICS = [
  { label: 'Servisi u narednih 30 dana', value: '38', caption: 'od 412 aktivnih uređaja' },
  { label: 'Servisi koji kasne', value: '7', caption: 'najstariji 24 dana' },
  { label: 'Rezervacije iz podsjetnika', value: '19', caption: 'ovaj mjesec' },
  { label: 'Potencijalni prihod (procjena)', value: '4.310 KM', caption: 'dospjeli uređaji × cijena' },
] as const

export const PREVIEW_QUEUES = [
  { label: 'Kupci bez kontakt podataka', count: 12, tone: 'warning' as const },
  { label: 'Uređaji bez servisnog intervala', count: 5, tone: 'warning' as const },
  { label: 'Neuspjeli podsjetnici', count: 2, tone: 'danger' as const },
  { label: 'Prijave kvara bez odgovora', count: 3, tone: 'danger' as const },
  { label: 'Rezervacije bez tehničara', count: 4, tone: 'info' as const },
] as const

/** Javna stranica uređaja — sadržaj koji kupac vidi nakon skeniranja QR koda. */
export const PREVIEW_PUBLIC_DEVICE = {
  company: PREVIEW_COMPANY,
  type: 'Klima uređaj',
  manufacturer: 'AeroTherm',
  model: 'ST-12 Inverter',
  maskedSerial: 'AT12••••04',
  installedAt: '15.04.2024.',
  warrantyUntil: '15.04.2029.',
  warrantyActive: true,
  nextService: '28.03.2027.',
  lastService: '20.03.2026.',
  history: [
    { date: '20.03.2026.', label: 'Redovni servis', note: 'Filteri očišćeni, provjeren pritisak.' },
    { date: '18.03.2025.', label: 'Redovni servis', note: 'Zamijenjen filter, izmjerena temperatura.' },
    { date: '15.04.2024.', label: 'Ugradnja', note: 'Puštanje u rad i obuka korisnika.' },
  ],
} as const
