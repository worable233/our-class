-- 027_fix_student_no.sql
-- 清理已存在的非纯数字学号：去掉前导 S 前缀，非数字学号用 id 重建
-- 新生成的学号统一为纯数字（时间戳后8位或自增id补齐）

-- 1) 去掉前导 S（如 S2025001 → 2025001）
UPDATE users SET student_no = substr(student_no, 2)
WHERE student_no LIKE 'S%' AND student_no GLOB 'S[0-9]*';

-- 2) 不以数字开头的学号直接用 id 补齐 8 位
UPDATE users SET student_no = printf('%08d', id)
WHERE student_no != '' AND student_no NOT GLOB '[0-9]*';

-- 3) 转数字后为 0 但不是 "0" 的（含非数字字符），用 id 补齐
UPDATE users SET student_no = printf('%08d', id)
WHERE student_no != '' AND student_no != '0' AND CAST(student_no AS REAL) = 0;

-- 4) 空的 student_no 也用 id 补齐
UPDATE users SET student_no = printf('%08d', id)
WHERE student_no IS NULL OR student_no = '';
