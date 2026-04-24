import {
  OrganizationType,
  PrismaClient,
  VendorSource,
} from "@prisma/client";
import { REGION_DEFAULT_CURRENCY } from "../src/lib/region";
import { newId } from "../src/lib/id";
import { registerSource } from "../src/server/services/ingestion/sources";
import type { PricingTarget } from "./pricing-targets";

export async function ensurePricingTarget(prisma: PrismaClient, target: PricingTarget) {
  const category = await prisma.serviceCategory.upsert({
    where: { code: target.categoryCode },
    create: {
      id: newId(),
      code: target.categoryCode,
      label: target.categoryLabel,
    },
    update: { label: target.categoryLabel, active: true },
  });

  let org = await prisma.organization.findFirst({
    where: { type: OrganizationType.vendor, legalName: target.vendorName },
    include: { vendorProfile: true },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        id: newId(),
        type: OrganizationType.vendor,
        legalName: target.vendorName,
        displayName: target.vendorName,
        website: target.website,
        region: target.region,
        defaultCurrency: REGION_DEFAULT_CURRENCY[target.region],
        vendorProfile: {
          create: {
            id: newId(),
            createdBySource: VendorSource.scrape,
            serviceSummary: `${target.vendorName} has public pricing pages tracked by Discovery Layer.`,
          },
        },
      },
      include: { vendorProfile: true },
    });
  } else {
    org = await prisma.organization.update({
      where: { id: org.id },
      data: {
        website: target.website,
        region: target.region,
        defaultCurrency: REGION_DEFAULT_CURRENCY[target.region],
      },
      include: { vendorProfile: true },
    });
  }

  const profile =
    org.vendorProfile ??
    (await prisma.vendorProfile.create({
      data: {
        id: newId(),
        organizationId: org.id,
        createdBySource: VendorSource.scrape,
        serviceSummary: `${target.vendorName} has public pricing pages tracked by Discovery Layer.`,
      },
    }));

  await prisma.vendorServiceCategory.upsert({
    where: {
      vendorProfileId_serviceCategoryId: {
        vendorProfileId: profile.id,
        serviceCategoryId: category.id,
      },
    },
    create: {
      id: newId(),
      vendorProfileId: profile.id,
      serviceCategoryId: category.id,
      primaryCategory: true,
    },
    update: { active: true },
  });

  const source = await registerSource(prisma, { url: target.pricingUrl });
  return { organization: org, profile, category, source };
}

