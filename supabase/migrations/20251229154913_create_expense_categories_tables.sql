/*
  # Create Expense Categories System

  ## Overview
  This migration creates a hierarchical category system for expenses with:
  - 12 main categories (admin-manageable)
  - Subcategories linked to categories
  - Soft delete via is_active flag (no data loss)
  - Restrict deletion if categories are in use

  ## New Tables
  
  ### `expense_categories`
  - `id` (uuid, primary key) - Unique category identifier
  - `name` (text, not null, unique) - Category name
  - `sort_order` (integer, not null) - Display order
  - `is_active` (boolean, default true) - Soft delete flag
  - `created_at` (timestamptz, not null) - Creation timestamp

  ### `expense_subcategories`
  - `id` (uuid, primary key) - Unique subcategory identifier
  - `category_id` (uuid, not null) - Foreign key to expense_categories
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

-- Create expense_categories table
CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create expense_subcategories table
CREATE TABLE IF NOT EXISTS expense_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, name)
);

-- Enable RLS
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_subcategories ENABLE ROW LEVEL SECURITY;

-- Policy for expense_categories: authenticated users can read
CREATE POLICY "Authenticated users can view expense categories"
  ON expense_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy for expense_subcategories: authenticated users can read
CREATE POLICY "Authenticated users can view expense subcategories"
  ON expense_subcategories
  FOR SELECT
  TO authenticated
  USING (true);