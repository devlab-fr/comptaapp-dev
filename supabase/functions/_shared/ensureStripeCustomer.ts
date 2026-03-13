import type Stripe from "npm:stripe@17";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

interface EnsureStripeCustomerParams {
  stripe: Stripe;
  supabaseAdmin: SupabaseClient;
  companyId: string;
  userId: string;
}

export async function ensureStripeCustomer({
  stripe,
  supabaseAdmin,
  companyId,
  userId,
}: EnsureStripeCustomerParams): Promise<string> {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("stripe_customer_id, name")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  const { data: user } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  const userEmail = authUser?.user?.email || "";

  if (company.stripe_customer_id) {
    try {
      const existingCustomer = await stripe.customers.retrieve(company.stripe_customer_id);
      if (!existingCustomer.deleted) {
        const needsUpdate =
          existingCustomer.name !== company.name ||
          existingCustomer.metadata?.companyName !== company.name ||
          !existingCustomer.metadata?.companyId;

        if (needsUpdate) {
          console.log("STRIPE_CUSTOMER_UPDATE_NAME_METADATA", {
            companyId,
            stripe_customer_id: company.stripe_customer_id,
            oldName: existingCustomer.name,
            newName: company.name,
          });

          await stripe.customers.update(company.stripe_customer_id, {
            name: company.name,
            metadata: {
              companyId,
              companyName: company.name,
              userId,
            },
          });
        }

        console.log("STRIPE_CUSTOMER_USE_EXISTING", {
          companyId,
          stripe_customer_id: company.stripe_customer_id,
          updated: needsUpdate,
        });
        return company.stripe_customer_id;
      } else {
        console.log("STRIPE_CUSTOMER_MISSING_IN_STRIPE_RECREATE", {
          companyId,
          oldId: company.stripe_customer_id,
        });
      }
    } catch (err: any) {
      if (err.statusCode === 404 || err.code === "resource_missing") {
        console.log("STRIPE_CUSTOMER_MISSING_IN_STRIPE_RECREATE", {
          companyId,
          oldId: company.stripe_customer_id,
        });
      } else {
        throw err;
      }
    }
  }

  const customers = await stripe.customers.list({
    limit: 100,
  });

  const foundCustomer = customers.data.find(
    (c) => c.metadata?.company_id === companyId || c.metadata?.companyId === companyId
  );

  if (foundCustomer) {
    const needsUpdate =
      foundCustomer.name !== company.name ||
      foundCustomer.metadata?.companyName !== company.name;

    if (needsUpdate) {
      console.log("STRIPE_CUSTOMER_UPDATE_FOUND_BY_METADATA", {
        companyId,
        stripe_customer_id: foundCustomer.id,
        oldName: foundCustomer.name,
        newName: company.name,
      });

      await stripe.customers.update(foundCustomer.id, {
        name: company.name,
        metadata: {
          companyId,
          companyName: company.name,
          userId,
        },
      });
    }

    console.log("STRIPE_CUSTOMER_FOUND_BY_METADATA", {
      companyId,
      stripe_customer_id: foundCustomer.id,
      updated: needsUpdate,
    });

    await supabaseAdmin
      .from("companies")
      .update({ stripe_customer_id: foundCustomer.id })
      .eq("id", companyId);

    return foundCustomer.id;
  }

  const newCustomer = await stripe.customers.create({
    name: company.name,
    email: userEmail,
    description: "ComptaApp company",
    metadata: {
      companyId,
      companyName: company.name,
      userId,
    },
  });

  console.log("STRIPE_CUSTOMER_CREATED", {
    companyId,
    stripe_customer_id: newCustomer.id,
  });

  await supabaseAdmin
    .from("companies")
    .update({ stripe_customer_id: newCustomer.id })
    .eq("id", companyId);

  return newCustomer.id;
}
