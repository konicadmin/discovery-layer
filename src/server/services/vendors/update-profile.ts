import {
  ComplianceStatus,
  ComplianceType,
  type Prisma,
} from "@/generated/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { type Db, withTx } from "@/server/db/with-tx";
import { logEvent } from "@/server/services/audit/log-event";

export type UpdateProfileInput = {
  vendorProfileId: string;
  serviceSummary?: string;
  yearEstablished?: number;
  employeeBand?: string;
  hqCityId?: string | null;
  operatingCitiesCount?: number;
  organization?: {
    legalName?: string;
    displayName?: string;
    gstin?: string;
    website?: string;
    primaryPhone?: string;
  };
  actorUserId?: string;
};

export async function updateProfile(db: Db, input: UpdateProfileInput) {
  return withTx(db, async (tx) => {
    const profile = await tx.vendorProfile.findUnique({
      where: { id: input.vendorProfileId },
      include: { organization: true },
    });
    if (!profile) throw new NotFoundError("vendor_profile", input.vendorProfileId);

    const before = {
      profile: {
        serviceSummary: profile.serviceSummary,
        yearEstablished: profile.yearEstablished,
        employeeBand: profile.employeeBand,
        hqCityId: profile.hqCityId,
        operatingCitiesCount: profile.operatingCitiesCount,
      },
      organization: {
        legalName: profile.organization.legalName,
        displayName: profile.organization.displayName,
        gstin: profile.organization.gstin,
        website: profile.organization.website,
        primaryPhone: profile.organization.primaryPhone,
      },
    };

    if (input.organization) {
      await tx.organization.update({
        where: { id: profile.organizationId },
        data: input.organization,
      });
    }

    const updated = await tx.vendorProfile.update({
      where: { id: profile.id },
      data: {
        serviceSummary: input.serviceSummary,
        yearEstablished: input.yearEstablished,
        employeeBand: input.employeeBand,
        hqCityId: input.hqCityId,
        operatingCitiesCount: input.operatingCitiesCount,
      },
      include: { organization: true },
    });

    await logEvent(tx, {
      actorUserId: input.actorUserId,
      actorOrganizationId: profile.organizationId,
      entityType: "vendor_profile",
      entityId: profile.id,
      action: "vendor.profile_updated",
      before,
      after: {
        profile: {
          serviceSummary: updated.serviceSummary,
          yearEstablished: updated.yearEstablished,
          employeeBand: updated.employeeBand,
          hqCityId: updated.hqCityId,
          operatingCitiesCount: updated.operatingCitiesCount,
        },
        organization: {
          legalName: updated.organization.legalName,
          displayName: updated.organization.displayName,
          gstin: updated.organization.gstin,
          website: updated.organization.website,
          primaryPhone: updated.organization.primaryPhone,
        },
      },
    });

    return updated;
  });
}

export async function addServiceArea(
  db: Db,
  args: {
    vendorProfileId: string;
    cityId: string;
    locality?: string;
    actorUserId?: string;
  },
) {
  return withTx(db, async (tx) => {
    const created = await tx.vendorServiceArea.create({
      data: {
        id: newId(),
        vendorProfileId: args.vendorProfileId,
        cityId: args.cityId,
        locality: args.locality ?? null,
      },
    });
    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "vendor_service_area",
      entityId: created.id,
      action: "vendor.service_area_added",
      after: { cityId: args.cityId, locality: args.locality },
    });
    return created;
  });
}

export async function upsertComplianceRecord(
  db: Db,
  args: {
    vendorProfileId: string;
    complianceType: ComplianceType;
    identifier?: string;
    issuingAuthority?: string;
    status?: ComplianceStatus;
    validFrom?: Date;
    validTo?: Date;
    notes?: string;
    actorUserId?: string;
  },
) {
  return withTx(db, async (tx) => {
    const existing = await tx.vendorComplianceRecord.findFirst({
      where: {
        vendorProfileId: args.vendorProfileId,
        complianceType: args.complianceType,
      },
    });
    const data: Prisma.VendorComplianceRecordCreateInput = {
      id: existing?.id ?? newId(),
      vendorProfile: { connect: { id: args.vendorProfileId } },
      complianceType: args.complianceType,
      identifier: args.identifier,
      issuingAuthority: args.issuingAuthority,
      status: args.status ?? ComplianceStatus.pending,
      validFrom: args.validFrom,
      validTo: args.validTo,
      notes: args.notes,
    };
    const record = existing
      ? await tx.vendorComplianceRecord.update({
          where: { id: existing.id },
          data: {
            identifier: args.identifier,
            issuingAuthority: args.issuingAuthority,
            status: args.status ?? existing.status,
            validFrom: args.validFrom,
            validTo: args.validTo,
            notes: args.notes,
          },
        })
      : await tx.vendorComplianceRecord.create({ data });

    await logEvent(tx, {
      actorUserId: args.actorUserId,
      entityType: "vendor_compliance_record",
      entityId: record.id,
      action: existing ? "compliance.updated" : "compliance.created",
      after: {
        complianceType: record.complianceType,
        status: record.status,
        validTo: record.validTo,
      },
    });

    return record;
  });
}

export async function attachDocument(
  db: Db,
  args: {
    vendorProfileId: string;
    documentType: import("@/generated/prisma").DocumentType;
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    uploadedByUserId?: string;
    actorUserId?: string;
  },
) {
  if (args.fileSize <= 0) throw new ValidationError("file_size must be positive");

  return withTx(db, async (tx) => {
    const file = await tx.documentFile.create({
      data: {
        id: newId(),
        storageKey: args.storageKey,
        fileName: args.fileName,
        mimeType: args.mimeType,
        fileSize: args.fileSize,
        uploadedByUserId: args.uploadedByUserId,
      },
    });
    const doc = await tx.vendorDocument.create({
      data: {
        id: newId(),
        vendorProfileId: args.vendorProfileId,
        documentFileId: file.id,
        documentType: args.documentType,
      },
    });
    await logEvent(tx, {
      actorUserId: args.actorUserId ?? args.uploadedByUserId,
      entityType: "vendor_document",
      entityId: doc.id,
      action: "vendor.document_uploaded",
      after: { documentType: doc.documentType, fileName: file.fileName },
    });
    return { document: doc, file };
  });
}
