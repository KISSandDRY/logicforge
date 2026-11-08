-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'INSTRUCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "SimulationStatus" AS ENUM ('STABLE', 'RUNNING', 'OSCILLATION_GUARD', 'BUS_CONFLICT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuits" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Комбінаційні схеми',
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "schema_json" JSONB NOT NULL,
    "node_count" INTEGER NOT NULL DEFAULT 0,
    "edge_count" INTEGER NOT NULL DEFAULT 0,
    "critical_path_ns" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_clock_mhz" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "author_id" TEXT NOT NULL,
    "forked_from_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circuits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuit_revisions" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "commit_message" TEXT NOT NULL,
    "schema_json" JSONB NOT NULL,
    "node_count" INTEGER NOT NULL DEFAULT 0,
    "edge_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circuit_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_components" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "propagation_delay_ns" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "definition_json" JSONB NOT NULL,
    "is_shared" BOOLEAN NOT NULL DEFAULT true,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_runs" (
    "id" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "executed_by_id" TEXT,
    "duration_sim_ns" DOUBLE PRECISION NOT NULL,
    "processed_events" INTEGER NOT NULL,
    "critical_path_ns" DOUBLE PRECISION NOT NULL,
    "status" "SimulationStatus" NOT NULL DEFAULT 'STABLE',
    "summary_payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "circuits_author_id_idx" ON "circuits"("author_id");

-- CreateIndex
CREATE INDEX "circuits_category_idx" ON "circuits"("category");

-- CreateIndex
CREATE INDEX "circuits_is_public_idx" ON "circuits"("is_public");

-- CreateIndex
CREATE INDEX "circuit_revisions_circuit_id_idx" ON "circuit_revisions"("circuit_id");

-- CreateIndex
CREATE UNIQUE INDEX "circuit_revisions_circuit_id_version_number_key" ON "circuit_revisions"("circuit_id", "version_number");

-- CreateIndex
CREATE INDEX "custom_components_author_id_idx" ON "custom_components"("author_id");

-- CreateIndex
CREATE INDEX "simulation_runs_circuit_id_idx" ON "simulation_runs"("circuit_id");

-- AddForeignKey
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_revisions" ADD CONSTRAINT "circuit_revisions_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuit_revisions" ADD CONSTRAINT "circuit_revisions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_components" ADD CONSTRAINT "custom_components_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_executed_by_id_fkey" FOREIGN KEY ("executed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
