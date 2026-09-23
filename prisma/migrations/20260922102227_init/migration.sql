-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('PDL', 'GITHUB', 'TAVILY', 'EXA', 'SERPER', 'INTERNAL_DB');

-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('LINKEDIN_URL', 'GITHUB_URL', 'PORTFOLIO_URL', 'PDL_ID', 'GITHUB_LOGIN', 'EMAIL_HASH', 'NAME_COMPANY');

-- CreateEnum
CREATE TYPE "OpenToWorkStatus" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SkillSource" AS ENUM ('PDL_STRUCTURED', 'GITHUB_LANGUAGE', 'BIO_EXTRACTED', 'GROQ_ENRICHED');

-- CreateEnum
CREATE TYPE "CertificationSource" AS ENUM ('PDL', 'WEB_EXTRACTED');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "currentTitle" TEXT,
    "currentCompany" TEXT,
    "location" TEXT,
    "summary" TEXT,
    "experienceYears" INTEGER,
    "educationLevel" TEXT,
    "estimatedSalaryMin" INTEGER,
    "estimatedSalaryMax" INTEGER,
    "estimatedSalaryCurrency" TEXT DEFAULT 'USD',
    "salarySource" TEXT,
    "openToWork" "OpenToWorkStatus" NOT NULL DEFAULT 'UNKNOWN',
    "openToWorkEvidence" TEXT,
    "openToWorkSource" TEXT,
    "profileTrustScore" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateIdentity" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "type" "IdentityType" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProvider" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "providerCandidateId" TEXT,
    "profileUrl" TEXT,
    "rawData" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSkill" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "source" "SkillSource" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateCertification" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "source" "CertificationSource" NOT NULL,
    "sourceUrl" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Search" (
    "id" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "mandatorySkills" TEXT[],
    "mustHaveSkills" TEXT[],
    "niceToHaveSkills" TEXT[],
    "location" TEXT,
    "freshSearch" BOOLEAN NOT NULL DEFAULT false,
    "totalFound" INTEGER,
    "creditsUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Search_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchResult" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "relevanceScore" INTEGER NOT NULL,
    "matchedSkills" TEXT[],
    "missingSkills" TEXT[],
    "excludedByFreshness" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "searchContextHash" TEXT NOT NULL,
    "jobTitleSnapshot" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "timesSeen" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candidate_fullName_idx" ON "Candidate"("fullName");

-- CreateIndex
CREATE INDEX "CandidateIdentity_candidateId_idx" ON "CandidateIdentity"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateIdentity_type_value_key" ON "CandidateIdentity"("type", "value");

-- CreateIndex
CREATE INDEX "CandidateProvider_candidateId_idx" ON "CandidateProvider"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateProvider_provider_providerCandidateId_idx" ON "CandidateProvider"("provider", "providerCandidateId");

-- CreateIndex
CREATE INDEX "CandidateSkill_candidateId_idx" ON "CandidateSkill"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSkill_candidateId_skill_key" ON "CandidateSkill"("candidateId", "skill");

-- CreateIndex
CREATE INDEX "CandidateCertification_candidateId_idx" ON "CandidateCertification"("candidateId");

-- CreateIndex
CREATE INDEX "SearchResult_searchId_idx" ON "SearchResult"("searchId");

-- CreateIndex
CREATE INDEX "SearchResult_candidateId_idx" ON "SearchResult"("candidateId");

-- CreateIndex
CREATE INDEX "SearchHistory_searchContextHash_idx" ON "SearchHistory"("searchContextHash");

-- CreateIndex
CREATE UNIQUE INDEX "SearchHistory_candidateId_searchContextHash_key" ON "SearchHistory"("candidateId", "searchContextHash");

-- AddForeignKey
ALTER TABLE "CandidateIdentity" ADD CONSTRAINT "CandidateIdentity_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateProvider" ADD CONSTRAINT "CandidateProvider_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateCertification" ADD CONSTRAINT "CandidateCertification_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchResult" ADD CONSTRAINT "SearchResult_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "Search"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchResult" ADD CONSTRAINT "SearchResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
