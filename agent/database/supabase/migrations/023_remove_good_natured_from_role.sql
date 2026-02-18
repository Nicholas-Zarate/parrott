-- Remove "good-natured" from role block; keep "Stay fun, not mean-spirited."

update public.parrot_tones
set
  task = replace(task, 'Stay fun and good-natured, not mean-spirited.', 'Stay fun, not mean-spirited.'),
  updated_at = now()
where slug = 'role'
  and task like '%good-natured%';
