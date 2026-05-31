-- Productos Cabane Sandwiches
-- Ejecutar en Supabase SQL Editor para cargar el menú completo

-- Limpiar productos existentes (opcional)
-- DELETE FROM products;

INSERT INTO products (name, category, price, is_active) VALUES
-- SÁNDUCHES
('Clásico', 'Sánduches', 5.50, true),
('Cabane Wich', 'Sánduches', 5.75, true),
('El de la Casa', 'Sánduches', 7.00, true),
('Wuela-Meet', 'Sánduches', 7.00, true),
('Chori', 'Sánduches', 6.00, true),
('Pollo en Salsa', 'Sánduches', 6.00, true),
('Pollo a la Plancha', 'Sánduches', 6.00, true),
('Pollo Crujiente', 'Sánduches', 6.00, true),
('Sloppy Joe', 'Sánduches', 6.50, true),
('Vegetariano', 'Sánduches', 6.50, true),

-- DESAYUNOS
('Clásico Desayuno', 'Desayunos', 5.50, true),
('Napolitano', 'Desayunos', 7.00, true),
('Pancakes', 'Desayunos', 6.00, true),
('Campestre', 'Desayunos', 7.00, true),
('Tostada de Aguacate', 'Desayunos', 6.00, true),

-- CLÁSICOS
('Pollo Clásico Cabane', 'Clásicos', 6.50, true),
('Chori-Lomo Cabane', 'Clásicos', 7.25, true),

-- ENSALADAS
('Tipo César', 'Ensaladas', 6.50, true),
('Cabane Salad', 'Ensaladas', 5.75, true),

-- TABLITAS
('Blita Clásica', 'Tablitas', 6.50, true),
('Blita Cabane', 'Tablitas', 8.00, true),

-- PARA COMPARTIR
('La Sabrosa', 'Para Compartir', 9.00, true),
('La Jugosa', 'Para Compartir', 8.50, true),
('Mixta', 'Para Compartir', 10.50, true),

-- BEBIDAS
('Té Helado', 'Bebidas', 2.00, true),
('Jamaica', 'Bebidas', 1.50, true),
('Limonada', 'Bebidas', 1.50, true),
('Limonada de Coco', 'Bebidas', 2.50, true),
('Limonada de Fresa', 'Bebidas', 2.50, true),
('Jugos', 'Bebidas', 2.00, true),
('Batidos', 'Bebidas', 2.50, true),
('Milkshake', 'Bebidas', 3.50, true),
('Agua sin Gas', 'Bebidas', 1.50, true),
('Agua con Gas', 'Bebidas', 1.50, true),
('Colas', 'Bebidas', 1.50, true),
('Cerveza Club', 'Bebidas', 2.50, true),
('Cerveza Stella', 'Bebidas', 3.50, true),
('Copa de Vino Tinto', 'Bebidas', 4.50, true),
('Mojito', 'Bebidas', 5.50, true),
('Cuba Libre', 'Bebidas', 5.00, true),
('Latte Baileys', 'Bebidas', 4.50, true),
('Mazeratto', 'Bebidas', 4.50, true),
('Mazeratto Tiramisu', 'Bebidas', 5.00, true),

-- CAFÉS
('Americano', 'Cafés', 2.00, true),
('Capuccino', 'Cafés', 3.00, true),
('Mocaccino', 'Cafés', 3.50, true),
('Aromática', 'Cafés', 1.50, true),
('Chocolate Caliente', 'Cafés', 3.50, true),
('Latte Ferrero Rocher', 'Cafés', 4.75, true),
('Frappuccino', 'Cafés', 3.00, true),
('Mocafrape', 'Cafés', 3.50, true),
('Ice Latte', 'Cafés', 3.00, true),
('Moca Ice Latte', 'Cafés', 3.50, true),
('Coco Ice Latte', 'Cafés', 4.50, true),
('Frutos Rojos Ice Latte', 'Cafés', 4.50, true),

-- POSTRES
('Chesscake de Arándanos', 'Postres', 3.75, true),
('Chesscake Nutrella y Kinder', 'Postres', 4.75, true),
('Chesscake Avellana y Ferrero Rocher', 'Postres', 4.75, true),
('Copa Tres Leches', 'Postres', 3.50, true),
('Copa Tiramisu', 'Postres', 3.50, true);
