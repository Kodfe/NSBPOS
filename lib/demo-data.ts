import { Product } from '@/types';

export const DEMO_PRODUCTS: Product[] = [
  // ── Dairy ─────────────────────────────────────────────────────────────────
  { id: '1', name: 'Amul Full Cream Milk 1L', barcode: '8901063011083', price: 68, mrp: 68, gstRate: 5, hsnCode: '0401', category: 'Dairy', unit: 'ltr', stock: 50, brand: 'Amul', isActive: true },
  { id: '2', name: 'Amul Butter 500g', barcode: '8901063013377', price: 260, mrp: 275, gstRate: 12, hsnCode: '0405', category: 'Dairy', unit: 'piece', stock: 30, brand: 'Amul', isActive: true },
  // ── Grains ────────────────────────────────────────────────────────────────
  { id: '3', name: 'Fortune Sunflower Oil 1L', barcode: '8906003600014', price: 150, mrp: 165, gstRate: 5, hsnCode: '1512', category: 'Oil', unit: 'ltr', stock: 40, brand: 'Fortune', isActive: true },
  { id: '4', name: 'India Gate Basmati Rice 5kg', barcode: '8906000490017', price: 450, mrp: 490, gstRate: 0, hsnCode: '1006', category: 'Grains', unit: 'piece', stock: 25, brand: 'India Gate', isActive: true },
  { id: '5', name: 'Tata Salt 1kg', barcode: '8901117100031', price: 22, mrp: 24, gstRate: 0, hsnCode: '2501', category: 'Essentials', unit: 'piece', stock: 100, brand: 'Tata', isActive: true },
  { id: '6', name: 'Maggi 2-Minute Noodles 70g', barcode: '8901058853791', price: 14, mrp: 15, gstRate: 18, hsnCode: '1902', category: 'Instant Food', unit: 'piece', stock: 200, brand: 'Nestle', isActive: true },
  { id: '7', name: 'Aashirvaad Atta 10kg', barcode: '8901030849152', price: 390, mrp: 420, gstRate: 0, hsnCode: '1101', category: 'Grains', unit: 'piece', stock: 20, brand: 'Aashirvaad', isActive: true },
  { id: '8', name: 'Colgate MaxFresh 150g', barcode: '8901314100029', price: 99, mrp: 109, gstRate: 18, hsnCode: '3306', category: 'Personal Care', unit: 'piece', stock: 60, brand: 'Colgate', isActive: true },
  { id: '9', name: 'Dettol Soap 125g', barcode: '8901867000052', price: 48, mrp: 52, gstRate: 18, hsnCode: '3401', category: 'Personal Care', unit: 'piece', stock: 80, brand: 'Dettol', isActive: true },
  { id: '10', name: 'Surf Excel Matic 1kg', barcode: '8901030831393', price: 210, mrp: 230, gstRate: 18, hsnCode: '3402', category: 'Household', unit: 'piece', stock: 35, brand: 'Surf Excel', isActive: true },
  { id: '11', name: 'Britannia Good Day 100g', barcode: '8901063030015', price: 30, mrp: 35, gstRate: 18, hsnCode: '1905', category: 'Biscuits', unit: 'piece', stock: 150, brand: 'Britannia', isActive: true },
  { id: '12', name: 'Haldiram Bhujia 400g', barcode: '8906003820032', price: 130, mrp: 145, gstRate: 12, hsnCode: '2106', category: 'Snacks', unit: 'piece', stock: 45, brand: 'Haldiram', isActive: true },
  { id: '13', name: 'Pepsi 2L', barcode: '8901826100031', price: 95, mrp: 100, gstRate: 28, hsnCode: '2202', category: 'Beverages', unit: 'piece', stock: 60, brand: 'Pepsi', isActive: true },
  { id: '14', name: 'Nescafe Classic 100g', barcode: '8901058018115', price: 290, mrp: 310, gstRate: 5, hsnCode: '2101', category: 'Beverages', unit: 'piece', stock: 25, brand: 'Nestle', isActive: true },
  { id: '17', name: 'Banana', barcode: '0000000000003', price: 60, mrp: 65, gstRate: 0, hsnCode: '0803', category: 'Fruits', unit: 'dozen', stock: 30, brand: '', isActive: true },
  { id: '18', name: 'Parle-G 800g', barcode: '8901269111016', price: 55, mrp: 60, gstRate: 5, hsnCode: '1905', category: 'Biscuits', unit: 'piece', stock: 100, brand: 'Parle', isActive: true },
  { id: '19', name: "Lay's Classic Salted 26g", barcode: '8901491102528', price: 20, mrp: 20, gstRate: 12, hsnCode: '2004', category: 'Snacks', unit: 'piece', stock: 120, brand: "Lay's", isActive: true },
  { id: '20', name: 'Red Label Tea 500g', barcode: '8901030815447', price: 255, mrp: 275, gstRate: 5, hsnCode: '0902', category: 'Beverages', unit: 'piece', stock: 40, brand: 'Brooke Bond', isActive: true },

  // ── Loose / Weighed Items ─────────────────────────────────────────────────
  { id: 'L1', name: 'Potato', barcode: 'L001', price: 28, mrp: 30, gstRate: 0, hsnCode: '0701', category: 'Loose', unit: 'kg', stock: 120, minStock: 10, brand: '', isActive: true, isLoose: true },
  { id: 'L2', name: 'Onion', barcode: 'L002', price: 35, mrp: 38, gstRate: 0, hsnCode: '0703', category: 'Loose', unit: 'kg', stock: 85, minStock: 10, brand: '', isActive: true, isLoose: true },
  { id: 'L3', name: 'Tomato', barcode: 'L003', price: 40, mrp: 42, gstRate: 0, hsnCode: '0702', category: 'Loose', unit: 'kg', stock: 60, minStock: 8, brand: '', isActive: true, isLoose: true },
  { id: 'L4', name: 'Sugar', barcode: 'L004', price: 45, mrp: 46, gstRate: 0, hsnCode: '1701', category: 'Loose', unit: 'kg', stock: 200, minStock: 20, brand: '', isActive: true, isLoose: true },
  { id: 'L5', name: 'Rice (Loose)', barcode: 'L005', price: 52, mrp: 55, gstRate: 0, hsnCode: '1006', category: 'Loose', unit: 'kg', stock: 150, minStock: 20, brand: '', isActive: true, isLoose: true },
  { id: 'L6', name: 'Moong Dal', barcode: 'L006', price: 110, mrp: 115, gstRate: 0, hsnCode: '0713', category: 'Loose', unit: 'kg', stock: 80, minStock: 10, brand: '', isActive: true, isLoose: true },
  { id: 'L7', name: 'Atta (Loose)', barcode: 'L007', price: 38, mrp: 40, gstRate: 0, hsnCode: '1101', category: 'Loose', unit: 'kg', stock: 100, minStock: 15, brand: '', isActive: true, isLoose: true },
  { id: 'L8', name: 'Green Chilli', barcode: 'L008', price: 80, mrp: 85, gstRate: 0, hsnCode: '0904', category: 'Loose', unit: 'kg', stock: 15, minStock: 3, brand: '', isActive: true, isLoose: true },
  { id: 'L9', name: 'Ginger', barcode: 'L009', price: 120, mrp: 125, gstRate: 0, hsnCode: '0910', category: 'Loose', unit: 'kg', stock: 12, minStock: 2, brand: '', isActive: true, isLoose: true },
  { id: 'L10', name: 'Garlic', barcode: 'L010', price: 200, mrp: 210, gstRate: 0, hsnCode: '0703', category: 'Loose', unit: 'kg', stock: 10, minStock: 2, brand: '', isActive: true, isLoose: true },
  { id: 'L11', name: 'Carrot', barcode: 'L011', price: 45, mrp: 48, gstRate: 0, hsnCode: '0706', category: 'Loose', unit: 'kg', stock: 40, minStock: 5, brand: '', isActive: true, isLoose: true },
  { id: 'L12', name: 'Chana Dal', barcode: 'L012', price: 95, mrp: 100, gstRate: 0, hsnCode: '0713', category: 'Loose', unit: 'kg', stock: 70, minStock: 10, brand: '', isActive: true, isLoose: true },
];

export const CATEGORIES = [
  'All', 'Loose', 'Dairy', 'Grains', 'Oil', 'Essentials', 'Instant Food',
  'Personal Care', 'Household', 'Biscuits', 'Snacks', 'Beverages',
  'Vegetables', 'Fruits',
];
