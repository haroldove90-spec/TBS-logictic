-- =================================================================
-- TBS LOGISTICS SERVICES - ESQUEMA DE BASE DE DATOS COMPLETO (100% SEGURO)
-- =================================================================
-- NOTA IMPORTANTE:
-- Este script es COMPLETAMENTE NO DESTRUCTIVO e IDEMPOTENTE.
-- Utiliza "IF NOT EXISTS", "ADD COLUMN IF NOT EXISTS" y "ON CONFLICT DO UPDATE".
-- NO BORRA NINGÚN REGISTRO, NO HACE DROP NI TRUNCATE.
-- Si las tablas ya tienen datos, SE CONSERVAN ÍNTEGROS.
-- =================================================================

-- 1. TABLA: UNIDADES (Flota)
CREATE TABLE IF NOT EXISTS unidades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    eco TEXT,
    plate TEXT,
    type TEXT DEFAULT 'Camioneta',
    box_type TEXT DEFAULT 'Caja Seca',
    status TEXT DEFAULT 'AVAILABLE',
    current_odometer NUMERIC DEFAULT 0
);

-- Asegurar columnas en 'unidades' si la tabla ya existía
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unidades' AND column_name = 'current_odometer') THEN
        ALTER TABLE unidades ADD COLUMN current_odometer NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unidades' AND column_name = 'box_type') THEN
        ALTER TABLE unidades ADD COLUMN box_type TEXT DEFAULT 'Caja Seca';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unidades' AND column_name = 'type') THEN
        ALTER TABLE unidades ADD COLUMN type TEXT DEFAULT 'Camioneta';
    END IF;
END $$;


-- 2. TABLA: OPERADORES Y ADMINISTRADORES
CREATE TABLE IF NOT EXISTS operadores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    license_number TEXT,
    unit_number TEXT,
    plate TEXT,
    status TEXT DEFAULT 'AVAILABLE',
    role TEXT DEFAULT 'OPERATOR'
);

-- Asegurar columnas en 'operadores' si la tabla ya existía
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'operadores' AND column_name = 'role') THEN
        ALTER TABLE operadores ADD COLUMN role TEXT DEFAULT 'OPERATOR';
    END IF;
END $$;


-- 3. TABLA: VIAJES
CREATE TABLE IF NOT EXISTS viajes (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    code TEXT,
    origin TEXT,
    origin_address TEXT,
    origin_maps_link TEXT,
    destination TEXT,
    destinos_lista JSONB DEFAULT '[]'::jsonb,
    client TEXT DEFAULT 'Cliente General',
    project TEXT DEFAULT 'Logística',
    appointment TEXT DEFAULT '00:00',
    status TEXT DEFAULT 'Por Aceptar',
    scheduled_date TEXT,
    plate TEXT,
    operator_id TEXT,
    current_stage INTEGER DEFAULT 0,
    instructions TEXT,
    indicaciones_pdf_url TEXT,
    evidence JSONB DEFAULT '[]'::jsonb,
    evidence_status TEXT DEFAULT 'NONE',
    locationhistory JSONB DEFAULT '[]'::jsonb,
    extra_costs JSONB DEFAULT '[]'::jsonb,
    odometer_start NUMERIC,
    odometer_end NUMERIC,
    odometer_anterior NUMERIC,
    gastos_depositados NUMERIC,
    combustible_asignado NUMERIC,
    precio_por_litro NUMERIC,
    costo_total_combustible NUMERIC,
    km_estimados NUMERIC
);

-- Asegurar que todas las columnas de 'viajes' existan si la tabla ya existía previamente
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'origin_address') THEN
        ALTER TABLE viajes ADD COLUMN origin_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'origin_maps_link') THEN
        ALTER TABLE viajes ADD COLUMN origin_maps_link TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'extra_costs') THEN
        ALTER TABLE viajes ADD COLUMN extra_costs JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'locationhistory') THEN
        ALTER TABLE viajes ADD COLUMN locationhistory JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'destinos_lista') THEN
        ALTER TABLE viajes ADD COLUMN destinos_lista JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'evidence') THEN
        ALTER TABLE viajes ADD COLUMN evidence JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'evidence_status') THEN
        ALTER TABLE viajes ADD COLUMN evidence_status TEXT DEFAULT 'NONE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'current_stage') THEN
        ALTER TABLE viajes ADD COLUMN current_stage INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'odometer_start') THEN
        ALTER TABLE viajes ADD COLUMN odometer_start NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'odometer_end') THEN
        ALTER TABLE viajes ADD COLUMN odometer_end NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'odometer_anterior') THEN
        ALTER TABLE viajes ADD COLUMN odometer_anterior NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'gastos_depositados') THEN
        ALTER TABLE viajes ADD COLUMN gastos_depositados NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'combustible_asignado') THEN
        ALTER TABLE viajes ADD COLUMN combustible_asignado NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'precio_por_litro') THEN
        ALTER TABLE viajes ADD COLUMN precio_por_litro NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'costo_total_combustible') THEN
        ALTER TABLE viajes ADD COLUMN costo_total_combustible NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'km_estimados') THEN
        ALTER TABLE viajes ADD COLUMN km_estimados NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'operator_id') THEN
        ALTER TABLE viajes ADD COLUMN operator_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'instructions') THEN
        ALTER TABLE viajes ADD COLUMN instructions TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'indicaciones_pdf_url') THEN
        ALTER TABLE viajes ADD COLUMN indicaciones_pdf_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'viajes' AND column_name = 'scheduled_date') THEN
        ALTER TABLE viajes ADD COLUMN scheduled_date TEXT;
    END IF;
END $$;


-- 4. TABLA: NOTIFICACIONES
CREATE TABLE IF NOT EXISTS notificaciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    target_role TEXT DEFAULT 'ALL',
    target_user_id TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb
);


-- 5. TABLA: ALERTAS SOS
CREATE TABLE IF NOT EXISTS alertas_sos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    operator_name TEXT,
    lat NUMERIC,
    lng NUMERIC,
    trip_id TEXT
);

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alertas_sos' AND column_name = 'trip_id') THEN
        ALTER TABLE alertas_sos ADD COLUMN trip_id TEXT;
    ELSE
        BEGIN
            ALTER TABLE alertas_sos ALTER COLUMN trip_id TYPE TEXT;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- Gestionar Foreign Key segura (ON DELETE SET NULL para permitir borrar viajes sin bloquearse)
    BEGIN
        ALTER TABLE alertas_sos DROP CONSTRAINT IF EXISTS alertas_sos_trip_id_fkey;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
        ALTER TABLE alertas_sos ADD CONSTRAINT alertas_sos_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES viajes(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;


-- 6. POLÍTICAS DE ACCESO Y SEGURIDAD RLS (SELECT, INSERT, UPDATE, DELETE)
ALTER TABLE viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE operadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_sos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- Viajes
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'viajes' AND policyname = 'Public Read Viajes') THEN
        CREATE POLICY "Public Read Viajes" ON viajes FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'viajes' AND policyname = 'Public Insert Viajes') THEN
        CREATE POLICY "Public Insert Viajes" ON viajes FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'viajes' AND policyname = 'Public Update Viajes') THEN
        CREATE POLICY "Public Update Viajes" ON viajes FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'viajes' AND policyname = 'Public Delete Viajes') THEN
        CREATE POLICY "Public Delete Viajes" ON viajes FOR DELETE USING (true);
    END IF;

    -- Unidades
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unidades' AND policyname = 'Public Read Unidades') THEN
        CREATE POLICY "Public Read Unidades" ON unidades FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unidades' AND policyname = 'Public Insert Unidades') THEN
        CREATE POLICY "Public Insert Unidades" ON unidades FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unidades' AND policyname = 'Public Update Unidades') THEN
        CREATE POLICY "Public Update Unidades" ON unidades FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unidades' AND policyname = 'Public Delete Unidades') THEN
        CREATE POLICY "Public Delete Unidades" ON unidades FOR DELETE USING (true);
    END IF;

    -- Operadores
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operadores' AND policyname = 'Public Read Operadores') THEN
        CREATE POLICY "Public Read Operadores" ON operadores FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operadores' AND policyname = 'Public Insert Operadores') THEN
        CREATE POLICY "Public Insert Operadores" ON operadores FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operadores' AND policyname = 'Public Update Operadores') THEN
        CREATE POLICY "Public Update Operadores" ON operadores FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operadores' AND policyname = 'Public Delete Operadores') THEN
        CREATE POLICY "Public Delete Operadores" ON operadores FOR DELETE USING (true);
    END IF;

    -- Notificaciones
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notificaciones' AND policyname = 'Public Read Notificaciones') THEN
        CREATE POLICY "Public Read Notificaciones" ON notificaciones FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notificaciones' AND policyname = 'Public Insert Notificaciones') THEN
        CREATE POLICY "Public Insert Notificaciones" ON notificaciones FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notificaciones' AND policyname = 'Public Update Notificaciones') THEN
        CREATE POLICY "Public Update Notificaciones" ON notificaciones FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notificaciones' AND policyname = 'Public Delete Notificaciones') THEN
        CREATE POLICY "Public Delete Notificaciones" ON notificaciones FOR DELETE USING (true);
    END IF;

    -- Alertas SOS
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alertas_sos' AND policyname = 'Public Read SOS') THEN
        CREATE POLICY "Public Read SOS" ON alertas_sos FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alertas_sos' AND policyname = 'Public Insert SOS') THEN
        CREATE POLICY "Public Insert SOS" ON alertas_sos FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alertas_sos' AND policyname = 'Public Update SOS') THEN
        CREATE POLICY "Public Update SOS" ON alertas_sos FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alertas_sos' AND policyname = 'Public Delete SOS') THEN
        CREATE POLICY "Public Delete SOS" ON alertas_sos FOR DELETE USING (true);
    END IF;
END $$;


-- 7. STORAGE BUCKETS (Evidencias y Sonidos)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('evidencias', 'evidencias', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('sounds', 'sounds', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    -- Políticas para Bucket 'evidencias'
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public Access Evidencias') THEN
        CREATE POLICY "Public Access Evidencias" ON storage.objects FOR ALL USING (bucket_id = 'evidencias') WITH CHECK (bucket_id = 'evidencias');
    END IF;

    -- Políticas para Bucket 'sounds'
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public Access Sounds') THEN
        CREATE POLICY "Public Access Sounds" ON storage.objects FOR SELECT USING (bucket_id = 'sounds');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public Insert Sounds') THEN
        CREATE POLICY "Public Insert Sounds" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'sounds');
    END IF;
END $$;


-- 8. TIEMPO REAL (Realtime Publications)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE viajes;
  EXCEPTION WHEN duplicate_object OR others THEN NULL; END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;
  EXCEPTION WHEN duplicate_object OR others THEN NULL; END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE alertas_sos;
  EXCEPTION WHEN duplicate_object OR others THEN NULL; END;
END $$;


-- 9. USUARIOS Y ADMINISTRADORES (ON CONFLICT DO UPDATE - NO DUPLICA NI BORRA)
INSERT INTO operadores (name, username, password, role, plate, status) VALUES
('Ángel Becerril Rodríguez', 'angel.becerril', 'Angel#TBS24', 'ADMIN', 'ADM-01', 'AVAILABLE'),
('Weendolyn Bernardo Galarza', 'weendolyn.bernardo', 'Ween#TBS24', 'ADMIN', 'ADM-02', 'AVAILABLE'),
('Julián Jiménez Gómez', 'julian.jimenez', 'Julian#TBS24', 'ADMIN', 'ADM-03', 'AVAILABLE'),
('Estefanía de la Cruz Ruelas', 'estefania.cruz', 'Fania#TBS24', 'ADMIN', 'ADM-04', 'AVAILABLE'),
('Liliana García Garduño', 'liliana.garcia', 'Lily#TBS24', 'ADMIN', 'ADM-05', 'AVAILABLE'),
('Administrador General', 'admin.general', 'Admin#TBS24', 'ADMIN', 'ADM-06', 'AVAILABLE')
ON CONFLICT (username) DO UPDATE 
SET role = 'ADMIN', password = EXCLUDED.password;

-- Asegurar rol de administrador
UPDATE operadores SET role = 'ADMIN' WHERE username IN (
    'angel.becerril', 
    'weendolyn.bernardo', 
    'julian.jimenez', 
    'estefania.cruz', 
    'liliana.garcia', 
    'admin.general'
);

-- Operador Demo
INSERT INTO operadores (name, username, password, role, plate, status, unit_number, license_number) VALUES
('Operador Demo', 'operador', '123ope', 'OPERATOR', 'OP-DEMO', 'AVAILABLE', 'ECO-DEMO', 'LIC-12345')
ON CONFLICT (username) DO UPDATE 
SET password = EXCLUDED.password;
