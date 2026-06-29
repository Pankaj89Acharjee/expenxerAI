import type { UserProfile } from '@/src/types/models';

export function profileToFirestore(profile: UserProfile): Record<string, unknown> {
  return {
    email: profile.email,
    displayName: profile.displayName,
    photoUrl: profile.photoUrl ?? null,
    monthlyIncome: profile.monthlyIncome,
    baseSavingsRatePercent: profile.baseSavingsRatePercent,
    alertPreference: profile.alertPreference,
    designation: profile.designation ?? null,
    addressLine: profile.addressLine ?? null,
    town: profile.town ?? null,
    policeStation: profile.policeStation ?? null,
    district: profile.district ?? null,
    pinCode: profile.pinCode ?? null,
    state: profile.state ?? null,
    areaOfInterest: profile.areaOfInterest ?? null,
    splitwiseHandle: profile.splitwiseHandle ?? null,
  };
}

export function profileFromFirestore(data: Record<string, unknown>): UserProfile {
  return {
    email: String(data.email ?? ''),
    displayName: String(data.displayName ?? ''),
    photoUrl: (data.photoUrl as string | null) ?? null,
    monthlyIncome: Number(data.monthlyIncome ?? 5000),
    baseSavingsRatePercent: Number(data.baseSavingsRatePercent ?? 20),
    alertPreference: Boolean(data.alertPreference ?? true),
    designation: (data.designation as string | null) ?? null,
    addressLine: (data.addressLine as string | null) ?? null,
    town: (data.town as string | null) ?? null,
    policeStation: (data.policeStation as string | null) ?? null,
    district: (data.district as string | null) ?? null,
    pinCode: (data.pinCode as string | null) ?? null,
    state: (data.state as string | null) ?? null,
    areaOfInterest: (data.areaOfInterest as string | null) ?? null,
    splitwiseHandle: (data.splitwiseHandle as string | null) ?? null,
  };
}
