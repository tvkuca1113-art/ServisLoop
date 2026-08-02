/**
 * Izmišljeni podaci za demo organizaciju.
 *
 * ★ Sve je izmišljeno. ★
 * Imena su uobičajena bosanska, ali nisu vezana ni za koju stvarnu osobu.
 * Domene su `.primjer.ba` (ne postoji), telefoni su iz opsega rezervisanog
 * za primjere, a nazivi proizvođača opreme su izmišljeni da se ne bi
 * podrazumijevala veza sa stvarnim brendovima.
 *
 * Ovi podaci NIKAD ne završe u stvarnoj organizaciji — koriste ih samo
 * `npm run db:seed` i demo okruženje.
 */

export const DEMO_ORG = {
  name: 'TermoPlus Servis d.o.o.',
  slug: 'termoplus-demo',
  legalName: 'TermoPlus Servis d.o.o. Sarajevo',
  taxId: '4200000000001',
  email: 'servis@termoplus.primjer.ba',
  phone: '+387 33 000 100',
  address: 'Zmaja od Bosne 100',
  city: 'Sarajevo',
  postalCode: '71000',
} as const

export const DEMO_USERS = [
  {
    key: 'owner',
    email: 'vlasnik@termoplus.primjer.ba',
    fullName: 'Amir Hodžić',
    role: 'owner' as const,
    password: 'demo-lozinka-2027',
  },
  {
    key: 'dispatcher',
    email: 'dispecer@termoplus.primjer.ba',
    fullName: 'Selma Begić',
    role: 'dispatcher' as const,
    password: 'demo-lozinka-2027',
  },
  {
    key: 'tech1',
    email: 'damir@termoplus.primjer.ba',
    fullName: 'Damir Suljić',
    role: 'technician' as const,
    password: 'demo-lozinka-2027',
  },
  {
    key: 'tech2',
    email: 'nedim@termoplus.primjer.ba',
    fullName: 'Nedim Karić',
    role: 'technician' as const,
    password: 'demo-lozinka-2027',
  },
] as const

/** Gradovi s poštanskim brojevima — koriste se za lokacije. */
export const CITIES = [
  { name: 'Sarajevo', postalCode: '71000' },
  { name: 'Ilidža', postalCode: '71210' },
  { name: 'Vogošća', postalCode: '71320' },
  { name: 'Zenica', postalCode: '72000' },
  { name: 'Tuzla', postalCode: '75000' },
  { name: 'Mostar', postalCode: '88000' },
  { name: 'Bihać', postalCode: '77000' },
  { name: 'Travnik', postalCode: '72270' },
  { name: 'Visoko', postalCode: '71300' },
  { name: 'Konjic', postalCode: '88400' },
] as const

export const STREETS = [
  'Zmaja od Bosne',
  'Alipašina',
  'Maršala Tita',
  'Hamdije Kreševljakovića',
  'Bulevar Meše Selimovića',
  'Safeta Zajke',
  'Envera Šehovića',
  'Kolodvorska',
  'Vrbanja',
  'Grbavička',
  'Titova',
  'Bosanska',
  'Prijedorska',
  'Careva',
] as const

export const FIRST_NAMES = [
  'Amir',
  'Selma',
  'Emir',
  'Amila',
  'Damir',
  'Nedim',
  'Lejla',
  'Adnan',
  'Merima',
  'Kenan',
  'Amina',
  'Haris',
  'Dženana',
  'Vedad',
  'Ajla',
  'Tarik',
  'Nermina',
  'Faruk',
  'Sanela',
  'Mirza',
  'Belma',
  'Edin',
  'Ines',
  'Almir',
] as const

export const LAST_NAMES = [
  'Hodžić',
  'Begić',
  'Suljić',
  'Karić',
  'Delić',
  'Mujić',
  'Halilović',
  'Softić',
  'Osmanović',
  'Čengić',
  'Alagić',
  'Bašić',
  'Zukić',
  'Ferhatović',
  'Imamović',
  'Salihović',
  'Kovačević',
  'Đozić',
] as const

/** Pravna lica — tipični kupci HVAC firme. */
export const COMPANY_CUSTOMERS = [
  'Pekara Zlatni Klas d.o.o.',
  'Ordinacija Vita',
  'Hotel Kamena Ćuprija',
  'Market Ćošak d.o.o.',
  'Apoteka Zdravlje',
  'Restoran Bosanska Soba',
  'Frizerski salon Elegant',
  'Auto servis Motor Plus',
  'Knjigovodstvo Saldo d.o.o.',
  'Vrtić Sunce',
  'Teretana Forma',
  'Mesnica Kod Ćazima',
  'Advokatska kancelarija Lex',
  'Štamparija Grafo Print',
  'Optika Vid',
  'Poslovni centar Merkur',
] as const

/** Izmišljeni proizvođači opreme. */
export const MANUFACTURERS = {
  klima_uredaj: ['AeroTherm', 'ClimaVent', 'NordAir'],
  toplotna_pumpa: ['NordHeat', 'GeoTerm'],
  kotao: ['CaloMax', 'TermoBaza'],
  ventilaciona_jedinica: ['VentPro', 'AirFlow BH'],
  rashladni_uredaj: ['FrigoLine', 'ColdStar'],
  solarni_inverter: ['SolVolt'],
  druga_oprema: ['GenTech'],
} as const

export const MODELS = {
  klima_uredaj: ['ST-9 Inverter', 'ST-12 Inverter', 'ST-18 Inverter', 'CV-12 Eco', 'NA-24 Pro'],
  toplotna_pumpa: ['NordHeat 9', 'NordHeat 14', 'GeoTerm 11', 'GeoTerm 16'],
  kotao: ['CaloMax 24K', 'CaloMax 30K', 'TB-24 Condens', 'TB-35 Condens'],
  ventilaciona_jedinica: ['VentPro 400', 'VentPro 800', 'AF-600 Rekuperator'],
  rashladni_uredaj: ['RV-220', 'RV-400 Vitrina', 'CS-800 Komora'],
  solarni_inverter: ['SV-5K', 'SV-10K'],
  druga_oprema: ['GT-100'],
} as const

export const ISSUE_DESCRIPTIONS = [
  'Klima ne hladi kao ranije, izlazni zrak je mlak iako je postavljena na 18 stepeni.',
  'Iz unutrašnje jedinice curi voda po zidu, primijetili smo jutros.',
  'Uređaj pravi glasan zvuk pri pokretanju, kao da nešto grebe.',
  'Na displeju se pojavljuje kod E5 i uređaj se gasi nakon par minuta.',
  'Kotao se gasi kad se uključi topla voda, radi normalno samo na grijanju.',
  'Rashladna vitrina ne drži temperaturu ispod 8 stepeni, roba se kvari.',
  'Daljinski ne radi, mijenjali smo baterije ali bez promjene.',
  'Ventilacija u salonu radi mnogo slabije nego prošle godine.',
] as const

export const SERVICE_NOTES = [
  'Filteri očišćeni, izmjeren pritisak rashladnog sredstva, sve u granicama.',
  'Zamijenjen filter, provjeren odvod kondenzata, očišćen isparivač.',
  'Očišćen kondenzator, provjereni električni spojevi, dotegnute stezaljke.',
  'Izvršen godišnji servis prema uputstvu proizvođača, uređaj radi ispravno.',
  'Provjeren rad ventilatora i termostata, podešena temperatura po dogovoru.',
] as const

export const RECOMMENDATIONS = [
  'Preporučujemo čišćenje filtera svaka dva mjeseca u sezoni.',
  'Vanjska jedinica je izložena suncu — razmotriti nadstrešnicu.',
  'Pri sljedećem servisu razmotriti zamjenu ventilatora, čuje se blago pojačan zvuk.',
  null,
  null,
] as const

export const MATERIALS = [
  { name: 'Filter za unutrašnju jedinicu', sku: 'FLT-100', unit: 'kom', unitPrice: 18 },
  { name: 'Sredstvo za čišćenje isparivača', sku: 'CHM-220', unit: 'l', unitPrice: 12.5 },
  { name: 'Rashladno sredstvo R32', sku: 'GAS-R32', unit: 'kg', unitPrice: 45 },
  { name: 'Crijevo za odvod kondenzata', sku: 'HOS-16', unit: 'm', unitPrice: 4.2 },
  { name: 'Stezaljka 16 mm', sku: 'CLP-16', unit: 'kom', unitPrice: 1.8 },
  { name: 'Ekspanzioni ventil', sku: 'VLV-EX2', unit: 'kom', unitPrice: 68 },
] as const

/**
 * Deterministički generator pseudoslučajnih brojeva.
 *
 * Seed podaci moraju izgledati identično pri svakom pokretanju: tako se
 * demonstracija ne mijenja između dva prikaza, a integracijski testovi
 * mogu očekivati konkretne vrijednosti. Zato NE koristimo `Math.random()`.
 */
export function createRandom(seed: number) {
  let state = seed >>> 0

  function next(): number {
    // xorshift32 — kratak, brz i potpuno deterministički.
    state ^= state << 13
    state >>>= 0
    state ^= state >> 17
    state ^= state << 5
    state >>>= 0
    return state / 0xffffffff
  }

  return {
    next,
    int(min: number, max: number): number {
      return Math.floor(next() * (max - min + 1)) + min
    },
    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)]
      if (item === undefined) throw new Error('createRandom.pick: prazna lista')
      return item
    },
    bool(probability = 0.5): boolean {
      return next() < probability
    },
  }
}
