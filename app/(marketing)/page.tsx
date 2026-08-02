import type { Metadata } from 'next'
import { Hero } from '@/components/marketing/hero'
import { ThreeStepSection } from '@/components/marketing/three-step-section'
import { WorkflowSection } from '@/components/marketing/workflow-section'
import { RevenueCalculator } from '@/components/marketing/revenue-calculator'
import { BenefitsSection } from '@/components/marketing/benefits-section'
import { ProductPreview } from '@/components/marketing/product-preview'
import { QrJourneySection } from '@/components/marketing/qr-journey-section'
import { ReminderJourneySection } from '@/components/marketing/reminder-journey-section'
import { TeamWorkflowSection } from '@/components/marketing/team-workflow-section'
import { SecuritySection } from '@/components/marketing/security-section'
import { PricingSection } from '@/components/marketing/pricing-section'
import { FaqSection } from '@/components/marketing/faq-section'
import { FinalCta } from '@/components/marketing/final-cta'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'ServisLoop — Servis koji se vraća sam',
  description: SITE.heroSubheadline,
  alternates: { canonical: '/' },
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <ThreeStepSection />
      <WorkflowSection />
      <RevenueCalculator />
      <BenefitsSection />
      <ProductPreview />
      <QrJourneySection />
      <ReminderJourneySection />
      <TeamWorkflowSection />
      <SecuritySection />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </>
  )
}
