import type { Knex } from 'knex';

const img = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;

export async function seed(knex: Knex): Promise<void> {
  // wipe (child → parent)
  await knex('delivery_earnings').del().catch(() => {});
  await knex('delivery_assignments').del().catch(() => {});
  await knex('order_status_history').del().catch(() => {});
  await knex('order_items').del();
  await knex('payments').del();
  await knex('orders').del();
  await knex('cart_items').del();
  await knex('delivery_boys').del().catch(() => {});
  await knex('products').del();
  await knex('categories').del();
  await knex('banners').del();
  await knex('region_pricing').del().catch(() => {});
  await knex('service_areas').del();
  await knex('stores').del().catch(() => {});
  await knex('app_settings').del();
  await knex('users').whereIn('role', ['admin', 'delivery_boy', 'super_admin']).del();
  await knex('regions').del().catch(() => {});

  // ── region + store ─────────────────────────────────────
  const [region] = await knex('regions')
    .insert({ name: 'New Delhi - Central', city: 'New Delhi', state: 'Delhi', currency: 'INR' })
    .returning('id');
  const regionId = region.id;

  const [store] = await knex('stores')
    .insert({ region_id: regionId, name: 'Zero Mart - CP', address: 'Connaught Place, New Delhi' })
    .returning('id');
  const storeId = store.id;

  await knex('region_pricing').insert({
    region_id: regionId,
    base_delivery_fee: 20,
    min_order_value: 99,
    free_delivery_above: 299,
    surge_multiplier: 1.0,
    surge_active: false,
    promo_discount: 0,
  });

  // ── users: admin + sample delivery boy ─────────────────
  await knex('users').insert({
    phone: '9999900000',
    name: 'Zero Admin',
    email: 'admin@zero.local',
    role: 'admin',
    language: 'en',
    region_id: regionId,
  });

  const [boy] = await knex('users')
    .insert({
      phone: '9999911111',
      name: 'Ravi Delivery',
      role: 'delivery_boy',
      language: 'hi',
      region_id: regionId,
    })
    .returning('id');
  await knex('delivery_boys').insert({
    user_id: boy.id,
    region_id: regionId,
    store_id: storeId,
    vehicle_type: 'bike',
    vehicle_number: 'DL1AB1234',
    availability: 'offline',
    is_active: true,
  });

  // ── service pincodes (linked to region) ───────────────
  await knex('service_areas').insert([
    { pincode: '110001', city: 'New Delhi', area_name: 'Connaught Place', is_active: true, region_id: regionId },
    { pincode: '110002', city: 'New Delhi', area_name: 'Daryaganj', is_active: true, region_id: regionId },
  ]);

  // ── app settings ───────────────────────────────────────
  await knex('app_settings').insert([
    { key: 'delivery_fee', value: JSON.stringify(20) },
    { key: 'free_delivery_above', value: JSON.stringify(299) },
    { key: 'min_order_value', value: JSON.stringify(99) },
    { key: 'currency', value: JSON.stringify('INR') },
    { key: 'support_phone', value: JSON.stringify('+919999999999') },
    { key: 'whatsapp_number', value: JSON.stringify('+919999999999') },
    { key: 'delivery_payout_per_order', value: JSON.stringify(25) },
    {
      key: 'store',
      value: JSON.stringify({
        name: { en: 'Zero Mart', hi: 'ज़ीरो मार्ट' },
        tagline: { en: 'Delivered in minutes', hi: 'मिनटों में डिलीवरी' },
      }),
    },
  ]);

  // ── banners ────────────────────────────────────────────
  await knex('banners').insert([
    {
      title: JSON.stringify({ en: 'Fresh groceries, fast', hi: 'ताज़ा किराना, तेज़ डिलीवरी' }),
      image_url: img('banner1'),
      action_type: 'category',
      action_value: 'fruits-vegetables',
      sort_order: 1,
      is_active: true,
    },
    {
      title: JSON.stringify({ en: 'Daily essentials', hi: 'रोज़मर्रा की ज़रूरतें' }),
      image_url: img('banner2'),
      action_type: 'none',
      sort_order: 2,
      is_active: true,
    },
  ]);

  // ── categories ─────────────────────────────────────────
  const categories = [
    { slug: 'fruits-vegetables', en: 'Fruits & Vegetables', hi: 'फल और सब्ज़ियाँ' },
    { slug: 'dairy-bakery', en: 'Dairy & Bakery', hi: 'डेयरी और बेकरी' },
    { slug: 'snacks-beverages', en: 'Snacks & Beverages', hi: 'स्नैक्स और पेय' },
    { slug: 'staples', en: 'Atta, Rice & Dal', hi: 'आटा, चावल और दाल' },
    { slug: 'personal-care', en: 'Personal Care', hi: 'पर्सनल केयर' },
  ];

  const insertedCats = await knex('categories')
    .insert(
      categories.map((c, i) => ({
        slug: c.slug,
        name: JSON.stringify({ en: c.en, hi: c.hi }),
        image_url: img(`cat-${c.slug}`),
        sort_order: i + 1,
        is_active: true,
      }))
    )
    .returning(['id', 'slug']);

  const catId = (slug: string) => insertedCats.find((c) => c.slug === slug)!.id;

  // ── products ───────────────────────────────────────────
  const products = [
    { cat: 'fruits-vegetables', slug: 'banana-1dozen', en: 'Banana (Robusta)', hi: 'केला (रोबस्टा)', unit: '1 dozen', price: 49, mrp: 60 },
    { cat: 'fruits-vegetables', slug: 'tomato-1kg', en: 'Tomato', hi: 'टमाटर', unit: '1 kg', price: 32, mrp: 40 },
    { cat: 'fruits-vegetables', slug: 'onion-1kg', en: 'Onion', hi: 'प्याज़', unit: '1 kg', price: 35, mrp: 45 },
    { cat: 'dairy-bakery', slug: 'milk-1l', en: 'Toned Milk', hi: 'टोंड दूध', unit: '1 L', price: 56, mrp: 56 },
    { cat: 'dairy-bakery', slug: 'bread-400g', en: 'Brown Bread', hi: 'ब्राउन ब्रेड', unit: '400 g', price: 45, mrp: 50 },
    { cat: 'snacks-beverages', slug: 'chips-90g', en: 'Potato Chips', hi: 'आलू चिप्स', unit: '90 g', price: 30, mrp: 35 },
    { cat: 'snacks-beverages', slug: 'cola-750ml', en: 'Cola', hi: 'कोला', unit: '750 ml', price: 40, mrp: 45 },
    { cat: 'staples', slug: 'atta-5kg', en: 'Whole Wheat Atta', hi: 'गेहूं का आटा', unit: '5 kg', price: 245, mrp: 280 },
    { cat: 'staples', slug: 'rice-5kg', en: 'Basmati Rice', hi: 'बासमती चावल', unit: '5 kg', price: 420, mrp: 480 },
    { cat: 'personal-care', slug: 'soap-4pack', en: 'Bathing Soap', hi: 'नहाने का साबुन', unit: 'pack of 4', price: 120, mrp: 140 },
  ];

  await knex('products').insert(
    products.map((p, i) => ({
      category_id: catId(p.cat),
      slug: p.slug,
      name: JSON.stringify({ en: p.en, hi: p.hi }),
      description: JSON.stringify({
        en: `${p.en} — fresh and best quality, delivered to your door.`,
        hi: `${p.hi} — ताज़ा और बेहतरीन गुणवत्ता, आपके दरवाज़े तक।`,
      }),
      unit: p.unit,
      price: p.price,
      mrp: p.mrp,
      stock: 100,
      image_url: img(p.slug),
      images: JSON.stringify([img(p.slug), img(`${p.slug}-2`)]),
      is_active: true,
      sort_order: i + 1,
    }))
  );
}
