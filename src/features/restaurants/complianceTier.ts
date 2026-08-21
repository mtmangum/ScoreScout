export interface ComplianceTier {
  label: string
  description: string
}

export function complianceTier(score: number): ComplianceTier {
  if (score >= 90) {
    return {
      label: 'Excellent Compliance',
      description: 'Exceeded minimum safety requirements. Minor violations may have occurred, but food handling standards are exceptional.',
    }
  }
  if (score >= 80) {
    return {
      label: 'Satisfactory Compliance',
      description: 'Safe overall, with some minor, non-critical violations noted by inspectors.',
    }
  }
  if (score >= 70) {
    return {
      label: 'Marginal Compliance',
      description: 'Significant violations were found. The restaurant may stay open but must fix critical issues and pass a mandatory re-inspection.',
    }
  }
  return {
    label: 'Failing Score',
    description: 'An unsatisfactory safety risk. Triggers immediate corrective action, and can result in closure by the city.',
  }
}
