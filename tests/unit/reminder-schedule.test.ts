import { describe, expect, it } from 'vitest'
import {
  MAX_REMINDER_ATTEMPTS,
  buildDedupeKey,
  describeOffset,
  dueDateForRuleOnDay,
  dueDatesToScan,
  isPlausibleEmail,
  planRemindersForDay,
  previewSchedule,
  remindersToCancelAfterBooking,
  reminderSendDate,
  retryDelayMinutes,
  shouldRetry,
  type ReminderCandidate,
  type ReminderRule,
} from '@/domains/reminders/schedule'

const RULES: ReminderRule[] = [
  {
    id: 'rule-30',
    name: '30 dana prije servisa',
    offsetDays: -30,
    channel: 'email',
    templateKey: 'service_reminder',
    isActive: true,
  },
  {
    id: 'rule-14',
    name: '14 dana prije servisa',
    offsetDays: -14,
    channel: 'email',
    templateKey: 'service_reminder',
    isActive: true,
  },
  {
    id: 'rule-3',
    name: '3 dana prije servisa',
    offsetDays: -3,
    channel: 'email',
    templateKey: 'service_reminder_final',
    isActive: true,
  },
  {
    id: 'rule-0',
    name: 'Na dan servisa',
    offsetDays: 0,
    channel: 'email',
    templateKey: 'service_reminder_final',
    isActive: true,
  },
  {
    id: 'rule-overdue',
    name: '14 dana nakon roka',
    offsetDays: 14,
    channel: 'email',
    templateKey: 'service_overdue',
    isActive: false,
  },
]

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    deviceId: 'device-1',
    customerId: 'customer-1',
    dueDate: '2026-04-15',
    deviceActive: true,
    remindersEnabled: true,
    reminderConsent: true,
    recipientEmail: 'kupac@primjer.ba',
    hasActiveBooking: false,
    ...overrides,
  }
}

describe('reminderSendDate i dueDateForRuleOnDay', () => {
  it('su međusobno obrnute operacije', () => {
    expect(reminderSendDate('2026-04-15', -30)).toBe('2026-03-16')
    expect(dueDateForRuleOnDay('2026-03-16', -30)).toBe('2026-04-15')

    expect(reminderSendDate('2026-04-15', 0)).toBe('2026-04-15')
    expect(reminderSendDate('2026-04-15', 14)).toBe('2026-04-29')
    expect(dueDateForRuleOnDay('2026-04-29', 14)).toBe('2026-04-15')
  })

  it('tačno je preko prelaza na ljetno računanje vremena', () => {
    // Prelaz je 29.03.2026 — pomak od 30 dana ne smije skliznuti za jedan dan.
    expect(reminderSendDate('2026-04-20', -30)).toBe('2026-03-21')
    expect(dueDateForRuleOnDay('2026-03-21', -30)).toBe('2026-04-20')
  })
})

describe('dueDatesToScan', () => {
  it('vraća po jedan rok za svako aktivno pravilo', () => {
    // Za današnji 16.03. pravila gađaju rokove: 0 → danas, −3 → 19.03.,
    // −14 → 30.03., −30 → 15.04. Neaktivno pravilo (+14) se ne pretražuje.
    const dates = dueDatesToScan('2026-03-16', RULES)
    expect(dates).toEqual(['2026-03-16', '2026-03-19', '2026-03-30', '2026-04-15'])
  })

  it('ne ponavlja isti datum za dva pravila s istim pomakom', () => {
    const duplicated: ReminderRule[] = [
      { ...RULES[0]!, id: 'a' },
      { ...RULES[0]!, id: 'b' },
    ]
    expect(dueDatesToScan('2026-03-16', duplicated)).toHaveLength(1)
  })
})

describe('buildDedupeKey', () => {
  it('je stabilan za isti uređaj, pravilo i rok', () => {
    const first = buildDedupeKey('device-1', 'rule-30', '2026-04-15')
    const second = buildDedupeKey('device-1', 'rule-30', '2026-04-15')
    expect(first).toBe(second)
  })

  it('razlikuje uređaj, pravilo i rok', () => {
    const base = buildDedupeKey('device-1', 'rule-30', '2026-04-15')
    expect(buildDedupeKey('device-2', 'rule-30', '2026-04-15')).not.toBe(base)
    expect(buildDedupeKey('device-1', 'rule-14', '2026-04-15')).not.toBe(base)
    expect(buildDedupeKey('device-1', 'rule-30', '2026-04-16')).not.toBe(base)
  })
})

describe('planRemindersForDay', () => {
  it('planira podsjetnik tačno na dan koji odgovara pravilu', () => {
    const result = planRemindersForDay({
      today: '2026-03-16', // 30 dana prije 15.04.
      rules: RULES,
      candidates: [candidate()],
      existingKeys: new Set(),
    })

    expect(result.planned).toHaveLength(1)
    expect(result.planned[0]?.ruleId).toBe('rule-30')
    expect(result.planned[0]?.dueDate).toBe('2026-04-15')
    expect(result.planned[0]?.scheduledFor).toBe('2026-03-16')
  })

  it('ne planira ništa kad nijedno pravilo ne pada na taj dan', () => {
    const result = planRemindersForDay({
      today: '2026-03-17',
      rules: RULES,
      candidates: [candidate()],
      existingKeys: new Set(),
    })
    expect(result.planned).toHaveLength(0)
  })

  it('★ ne pravi duplikat kad ključ već postoji', () => {
    const existing = new Set([buildDedupeKey('device-1', 'rule-30', '2026-04-15')])

    const result = planRemindersForDay({
      today: '2026-03-16',
      rules: RULES,
      candidates: [candidate()],
      existingKeys: existing,
    })

    expect(result.planned).toHaveLength(0)
    expect(result.skipped[0]?.reason).toBe('already_exists')
  })

  it('★ dvostruko pokretanje istog dana daje isti rezultat', () => {
    const first = planRemindersForDay({
      today: '2026-03-16',
      rules: RULES,
      candidates: [candidate()],
      existingKeys: new Set(),
    })

    // Drugi krug: ključevi iz prvog kruga su sada u bazi.
    const second = planRemindersForDay({
      today: '2026-03-16',
      rules: RULES,
      candidates: [candidate()],
      existingKeys: new Set(first.planned.map((item) => item.dedupeKey)),
    })

    expect(first.planned).toHaveLength(1)
    expect(second.planned).toHaveLength(0)
  })

  it('preskače neaktivan uređaj', () => {
    const result = planRemindersForDay({
      today: '2026-03-16',
      rules: RULES,
      candidates: [candidate({ deviceActive: false })],
      existingKeys: new Set(),
    })
    expect(result.planned).toHaveLength(0)
    expect(result.skipped[0]?.reason).toBe('device_inactive')
  })

  it('preskače uređaj s isključenim podsjetnicima', () => {
    const result = planRemindersForDay({
      today: '2026-03-16',
      rules: RULES,
      candidates: [candidate({ remindersEnabled: false })],
      existingKeys: new Set(),
    })
    expect(result.skipped[0]?.reason).toBe('reminders_disabled')
  })

  it('poštuje odsustvo pristanka', () => {
    const result = planRemindersForDay({
      today: '2026-03-16',
      rules: RULES,
      candidates: [candidate({ reminderConsent: false })],
      existingKeys: new Set(),
    })
    expect(result.planned).toHaveLength(0)
    expect(result.skipped[0]?.reason).toBe('no_consent')
  })

  it('★ ne šalje podsjetnik kupcu koji je već rezervisao', () => {
    const result = planRemindersForDay({
      today: '2026-03-16',
      rules: RULES,
      candidates: [candidate({ hasActiveBooking: true })],
      existingKeys: new Set(),
    })
    expect(result.planned).toHaveLength(0)
    expect(result.skipped[0]?.reason).toBe('already_booked')
  })

  it('preskače kupca bez ispravne adrese, ali ga zabilježi', () => {
    for (const email of [null, '', 'nema', 'amir@', '@primjer.ba', 'a b@primjer.ba']) {
      const result = planRemindersForDay({
        today: '2026-03-16',
        rules: RULES,
        candidates: [candidate({ recipientEmail: email })],
        existingKeys: new Set(),
      })
      expect(result.planned).toHaveLength(0)
      expect(result.skipped[0]?.reason).toBe('missing_contact')
    }
  })

  it('ne koristi neaktivno pravilo', () => {
    // 29.04. je 14 dana nakon roka 15.04. — pravilo postoji, ali je isključeno.
    const result = planRemindersForDay({
      today: '2026-04-29',
      rules: RULES,
      candidates: [candidate()],
      existingKeys: new Set(),
    })
    expect(result.planned).toHaveLength(0)
  })

  it('obrađuje više uređaja odjednom', () => {
    const candidates = [
      candidate({ deviceId: 'd1' }),
      candidate({ deviceId: 'd2' }),
      candidate({ deviceId: 'd3', reminderConsent: false }),
    ]

    const result = planRemindersForDay({
      today: '2026-03-16',
      rules: RULES,
      candidates,
      existingKeys: new Set(),
    })

    expect(result.planned.map((item) => item.deviceId)).toEqual(['d1', 'd2'])
    expect(result.skipped).toHaveLength(1)
  })
})

describe('isPlausibleEmail', () => {
  it('prihvata ispravne adrese', () => {
    expect(isPlausibleEmail('amir@primjer.ba')).toBe(true)
    expect(isPlausibleEmail('a.b+c@pod.domena.com')).toBe(true)
  })

  it('odbija tipične greške iz uvoza', () => {
    expect(isPlausibleEmail('nema')).toBe(false)
    expect(isPlausibleEmail('-')).toBe(false)
    expect(isPlausibleEmail('amir@')).toBe(false)
    expect(isPlausibleEmail('amir@localhost')).toBe(false)
    expect(isPlausibleEmail('amir @primjer.ba')).toBe(false)
    expect(isPlausibleEmail('')).toBe(false)
  })
})

describe('ponovni pokušaj slanja', () => {
  it('pokušava ponovo do maksimalnog broja', () => {
    expect(shouldRetry(0, 'connection timeout')).toBe(true)
    expect(shouldRetry(1, 'rate limited')).toBe(true)
    expect(shouldRetry(MAX_REMINDER_ATTEMPTS, 'connection timeout')).toBe(false)
  })

  it('ne pokušava ponovo kod trajnih grešaka', () => {
    expect(shouldRetry(0, 'Invalid recipient address')).toBe(false)
    expect(shouldRetry(0, 'Recipient unsubscribed')).toBe(false)
    expect(shouldRetry(1, 'hard bounced')).toBe(false)
  })

  it('razmak između pokušaja raste', () => {
    expect(retryDelayMinutes(0)).toBe(5)
    expect(retryDelayMinutes(1)).toBe(30)
    expect(retryDelayMinutes(2)).toBe(120)
    expect(retryDelayMinutes(9)).toBe(120)
  })
})

describe('remindersToCancelAfterBooking', () => {
  it('otkazuje samo one koji još nisu poslani', () => {
    const reminders = [
      { id: 'r1', deviceId: 'd1', dueDate: '2026-04-15' as const, status: 'sent' as const },
      { id: 'r2', deviceId: 'd1', dueDate: '2026-04-15' as const, status: 'pending' as const },
      { id: 'r3', deviceId: 'd1', dueDate: '2026-04-15' as const, status: 'pending' as const },
      { id: 'r4', deviceId: 'd1', dueDate: '2027-04-15' as const, status: 'pending' as const },
      { id: 'r5', deviceId: 'd2', dueDate: '2026-04-15' as const, status: 'pending' as const },
    ]

    const toCancel = remindersToCancelAfterBooking(reminders, 'd1', '2026-04-15')
    // Poslana poruka je historijska činjenica i ne dira se.
    expect(toCancel).toEqual(['r2', 'r3'])
  })
})

describe('previewSchedule', () => {
  it('prikazuje kad ide koja poruka i šta je već prošlo', () => {
    const preview = previewSchedule('2026-04-15', RULES, '2026-03-20')

    expect(preview).toHaveLength(4)
    expect(preview[0]?.sendDate).toBe('2026-03-16')
    expect(preview[0]?.isPast).toBe(true)
    expect(preview[1]?.sendDate).toBe('2026-04-01')
    expect(preview[1]?.isPast).toBe(false)
    expect(preview.at(-1)?.sendDate).toBe('2026-04-15')
  })
})

describe('describeOffset', () => {
  it('opisuje pomak na bosanskom', () => {
    expect(describeOffset(-30)).toBe('30 dana prije roka')
    expect(describeOffset(-1)).toBe('1 dan prije roka')
    expect(describeOffset(0)).toBe('na dan roka')
    expect(describeOffset(14)).toBe('14 dana nakon roka')
  })
})
