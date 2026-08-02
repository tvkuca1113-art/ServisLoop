'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/disclosure'
import { Section, SectionIntro } from './section'

const FAQ = [
  {
    question: 'Moram li prebaciti cijelu bazu kupaca prije nego što sistem počne raditi?',
    answer:
      'Ne. Možete početi s jednom grupom uređaja — na primjer samo klima uređajima iz prošle godine. Uvoz iz Excela radi u serijama, a ostatak baze možete dodati kasnije. Podsjetnici rade za sve uređaje koji imaju rok servisa i ispravan kontakt.',
  },
  {
    question: 'Šta ako kupac nema e-mail adresu?',
    answer:
      'Uređaj ostaje u sistemu, ali se pojavljuje u listi „Kupci bez kontakt podataka“ na početnoj stranici. Tako tačno vidite koliko potencijalnog prihoda stoji zbog nedostajućeg kontakta. SMS i Viber nisu dio prve verzije, ali je sistem slanja napravljen tako da se dodaju bez prepravke logike podsjetnika.',
  },
  {
    question: 'Da li kupac mora instalirati aplikaciju ili otvoriti nalog?',
    answer:
      'Ne. Kupac skenira QR kod ili otvori link iz poruke i odmah vidi stranicu svog uređaja. Odatle može rezervisati termin ili prijaviti kvar. Nema registracije, lozinke ni instalacije.',
  },
  {
    question: 'Ko određuje kada je sljedeći servis?',
    answer:
      'Vaša firma. Za svaku vrstu opreme postavite interval u mjesecima (npr. klima 12, kotao 12, rashladna oprema 6). Kada se servis zatvori, sistem računa novi rok po tom pravilu. Tehničar ili dispečer mogu rok pomjeriti ručno, ali se razlog i vrijeme izmjene upisuju u dnevnik.',
  },
  {
    question: 'Šta se dogodi ako slanje e-pošte ne uspije?',
    answer:
      'Podsjetnik se označava kao neuspješan, s razlogom i brojem pokušaja — nikad kao poslan. Neuspjeh se vidi na početnoj stranici i na stranici podsjetnika, gdje ga možete ponovo poslati. Ponovno pokretanje dnevnog posla nikad ne šalje duplikat, jer baza ima jedinstveni ključ po uređaju, pravilu i roku.',
  },
  {
    question: 'Koristi li ServisLoop vještačku inteligenciju za odluke?',
    answer:
      'Ne za ništa bitno. Datumi, dostupni termini, cijene, dozvole i status garancije računaju se determinističkim pravilima na serveru. AI funkcije su opcione i služe samo kao pomoć pri pisanju (npr. sređivanje bilješki tehničara), uvijek označene kao prijedlog i uvijek uz ljudsku potvrdu. Sistem radi potpuno normalno i kad su isključene.',
  },
  {
    question: 'Mogu li izvesti svoje podatke ako odustanem?',
    answer:
      'Da. Kupci, lokacije, uređaji, servisi i radni nalozi izvoze se u CSV. Postupak izvoza i brisanja naloga opisan je u dokumentaciji, korak po korak.',
  },
  {
    question: 'Ko vidi cijene servisa i interne bilješke?',
    answer:
      'Samo vaš tim, prema ulozi. Tehničar ne vidi finansijske postavke ni naplatu. Kupac na javnoj stranici uređaja ne vidi cijene, interne bilješke ni privitke — samo osnovne podatke o uređaju, garanciju i sažetu historiju.',
  },
] as const

export function FaqSection() {
  return (
    <Section tone="edge">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <SectionIntro
          eyebrow="Česta pitanja"
          title="Pitanja koja postavljaju servisne firme"
          description="Ako nešto nije jasno, javite se — odgovor ide direktno u ovu listu."
        />

        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((item, index) => (
            <AccordionItem key={item.question} value={`faq-${index}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  )
}
