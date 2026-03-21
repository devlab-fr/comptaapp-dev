/*
  # Create Revenue Categories System

  ## Overview
  This migration creates a hierarchical category system for revenues with:
  - 4 main categories (admin-manageable)
  - Subcategories linked to categories
  - Soft delete via is_active flag (no data loss)
  - Restrict deletion if categories are in use

  ## New Tables
  
  ### `revenue_categories`
  - `id` (uuid, primary key) - Unique category identifier
  - `name` (text, not null, unique) - Category name
  - `sort_order` (integer, not null) - Display order
  - `is_active` (boolean, default true) - Soft delete flag
  - `created_at` (timestamptz, not null) - Creation timestamp

  ### `revenue_subcategories`
  - `id` (uuid, primary key) - Unique subcategory identifier
  - `category_id` (uuid, not null) - Foreign key to revenue_categories
  - `name` (text, not null) - Subcategory name
  - `sort_order` (integer, not null) - Display order within category
  - `is_active` (boolean, default true) - Soft delete flag
  - `created_at` (timestamptz, not null) - Creation timestamp
  - Unique constraint on (category_id, name) - No duplicate names per category

  ## Security (RLS)
  - Both tables: SELECT policy for authenticated users (read-only from client)
  - Admin management will be added later

  ## Constraints
  - ON DELETE RESTRICT prevents deletion if categories are in use
  - Soft delete via is_active preserves data integrity
*/

CREATE TABLE IF NOT EXISTS revenue_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenue_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES revenue_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, name)
);

ALTER TABLE revenue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view revenue categories"
  ON revenue_categories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view revenue subcategories"
  ON revenue_subcategories
  FOR SELECT
  TO authenticated
  USING (true);