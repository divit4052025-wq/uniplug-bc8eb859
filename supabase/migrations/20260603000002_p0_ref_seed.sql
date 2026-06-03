-- Phase 0 (seed): static starter data for the reference / taxonomy layer.
--
-- Pairs with 20260603000001_p0_ref_taxonomy.sql. A sensible starter set so the
-- signup typeahead is useful from day one; the long tail is handled by the
-- ref_add_requests "can't find it? request to add" queue. Structured for easy
-- expansion — append rows, re-run, done.
--
-- ref_specialties is the one CLOSED set (exactly six). Everything else is a
-- starter list, deliberately non-exhaustive.
--
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING, so re-running is a no-op
-- and any admin-curated edits/additions are never clobbered.
--
-- Verification: supabase/dev-seeds/p0-ref-taxonomy-verification.sql
--   (asserts the six fixed ref_specialties rows are present).

-- ─── ref_specialties — exactly six, closed set; mascot_key is a placeholder ───

INSERT INTO public.ref_specialties (key, label, mascot_key, sort_order) VALUES
  ('general',               'General',                'general',               1),
  ('essays',                'Essays',                 'essays',                2),
  ('sports',                'Sports',                 'sports',                3),
  ('cocurriculars',         'Co-curriculars',         'cocurriculars',         4),
  ('projects',              'Projects',               'projects',              5),
  ('competitive_exam_prep', 'Competitive-exam prep',  'competitive_exam_prep', 6)
ON CONFLICT (key) DO NOTHING;

-- ─── ref_academic_domains — soft allowlist for mentor college-email validation ───

INSERT INTO public.ref_academic_domains (domain) VALUES
  ('ac.in'), ('edu.in'), ('res.in'),
  ('iitb.ac.in'), ('iitd.ac.in'), ('iitm.ac.in'), ('iitk.ac.in'), ('iitkgp.ac.in'),
  ('iitr.ac.in'), ('iitg.ac.in'), ('iith.ac.in'), ('iitbhu.ac.in'), ('iiti.ac.in'),
  ('iisc.ac.in'), ('iiserpune.ac.in'), ('iiserkol.ac.in'), ('iisermohali.ac.in'),
  ('bits-pilani.ac.in'),
  ('iima.ac.in'), ('iimb.ac.in'), ('iimcal.ac.in'), ('iiml.ac.in'), ('iimk.ac.in'), ('iimidr.ac.in'),
  ('nitt.edu'), ('nitk.edu.in'), ('nitw.ac.in'),
  ('iiitd.ac.in'), ('iiit.ac.in'),
  ('du.ac.in'), ('jnu.ac.in'), ('jadavpuruniversity.in'), ('annauniv.edu'),
  ('vit.ac.in'), ('manipal.edu'), ('srmist.edu.in'), ('amity.edu'),
  ('christuniversity.in'), ('snu.edu.in'), ('ashoka.edu.in'), ('jgu.edu.in'),
  ('thapar.edu'), ('dtu.ac.in'), ('nsut.ac.in'), ('bennett.edu.in'), ('plaksha.edu.in')
ON CONFLICT (domain) DO NOTHING;

-- ─── ref_universities — Indian (matching key) + common overseas destinations ───

INSERT INTO public.ref_universities (name, country, aliases, source) VALUES
  -- IITs
  ('Indian Institute of Technology Bombay',      'India', ARRAY['IIT Bombay','IITB','IIT-B'],         'seed'),
  ('Indian Institute of Technology Delhi',       'India', ARRAY['IIT Delhi','IITD','IIT-D'],          'seed'),
  ('Indian Institute of Technology Madras',      'India', ARRAY['IIT Madras','IITM','IIT-M'],         'seed'),
  ('Indian Institute of Technology Kanpur',      'India', ARRAY['IIT Kanpur','IITK'],                 'seed'),
  ('Indian Institute of Technology Kharagpur',   'India', ARRAY['IIT Kharagpur','IIT KGP','IITKGP'],  'seed'),
  ('Indian Institute of Technology Roorkee',     'India', ARRAY['IIT Roorkee','IITR'],                'seed'),
  ('Indian Institute of Technology Guwahati',    'India', ARRAY['IIT Guwahati','IITG'],               'seed'),
  ('Indian Institute of Technology Hyderabad',   'India', ARRAY['IIT Hyderabad','IITH'],              'seed'),
  ('Indian Institute of Technology (BHU) Varanasi','India', ARRAY['IIT BHU','IIT Varanasi'],          'seed'),
  ('Indian Institute of Technology Indore',      'India', ARRAY['IIT Indore','IITI'],                 'seed'),
  -- IISc / IISERs
  ('Indian Institute of Science',                'India', ARRAY['IISc','IISc Bangalore','IISc Bengaluru'], 'seed'),
  ('Indian Institute of Science Education and Research Pune', 'India', ARRAY['IISER Pune'],            'seed'),
  ('Indian Institute of Science Education and Research Kolkata', 'India', ARRAY['IISER Kolkata'],      'seed'),
  ('Indian Institute of Science Education and Research Mohali', 'India', ARRAY['IISER Mohali'],        'seed'),
  -- IIMs
  ('Indian Institute of Management Ahmedabad',   'India', ARRAY['IIM Ahmedabad','IIMA'],              'seed'),
  ('Indian Institute of Management Bangalore',   'India', ARRAY['IIM Bangalore','IIMB'],              'seed'),
  ('Indian Institute of Management Calcutta',    'India', ARRAY['IIM Calcutta','IIMC'],               'seed'),
  ('Indian Institute of Management Lucknow',     'India', ARRAY['IIM Lucknow','IIML'],                'seed'),
  ('Indian Institute of Management Kozhikode',   'India', ARRAY['IIM Kozhikode','IIMK'],              'seed'),
  ('Indian Institute of Management Indore',      'India', ARRAY['IIM Indore'],                        'seed'),
  -- NITs
  ('National Institute of Technology Tiruchirappalli', 'India', ARRAY['NIT Trichy','NITT'],           'seed'),
  ('National Institute of Technology Karnataka, Surathkal', 'India', ARRAY['NITK Surathkal','NITK'],  'seed'),
  ('National Institute of Technology Warangal',  'India', ARRAY['NIT Warangal','NITW'],               'seed'),
  -- IIITs
  ('International Institute of Information Technology, Hyderabad', 'India', ARRAY['IIIT Hyderabad','IIIT-H'], 'seed'),
  ('Indraprastha Institute of Information Technology, Delhi', 'India', ARRAY['IIIT Delhi','IIIT-D'],   'seed'),
  -- Private / deemed
  ('Birla Institute of Technology and Science, Pilani', 'India', ARRAY['BITS Pilani','BITS'],         'seed'),
  ('Ashoka University',                          'India', ARRAY['Ashoka'],                            'seed'),
  ('Shiv Nadar University',                      'India', ARRAY['Shiv Nadar','SNU'],                  'seed'),
  ('O.P. Jindal Global University',              'India', ARRAY['Jindal','JGU'],                       'seed'),
  ('Plaksha University',                         'India', ARRAY['Plaksha'],                           'seed'),
  ('Vellore Institute of Technology',            'India', ARRAY['VIT','VIT Vellore'],                 'seed'),
  ('Manipal Academy of Higher Education',        'India', ARRAY['Manipal','MAHE'],                    'seed'),
  ('SRM Institute of Science and Technology',    'India', ARRAY['SRM','SRMIST'],                      'seed'),
  ('Amity University',                           'India', ARRAY['Amity'],                             'seed'),
  ('Christ University',                          'India', ARRAY['Christ'],                            'seed'),
  ('Symbiosis International University',          'India', ARRAY['Symbiosis','SIU'],                   'seed'),
  ('Thapar Institute of Engineering and Technology', 'India', ARRAY['Thapar','TIET'],                'seed'),
  ('Delhi Technological University',             'India', ARRAY['DTU'],                               'seed'),
  ('Netaji Subhas University of Technology',     'India', ARRAY['NSUT'],                              'seed'),
  -- Central / state universities
  ('University of Delhi',                        'India', ARRAY['Delhi University','DU'],             'seed'),
  ('Jawaharlal Nehru University',                'India', ARRAY['JNU'],                               'seed'),
  ('Jadavpur University',                        'India', ARRAY['JU'],                                'seed'),
  ('Anna University',                            'India', ARRAY['Anna Univ'],                         'seed'),
  ('University of Mumbai',                       'India', ARRAY['Mumbai University','MU'],            'seed'),
  ('Banaras Hindu University',                   'India', ARRAY['BHU'],                               'seed'),
  -- United States
  ('Massachusetts Institute of Technology',      'United States', ARRAY['MIT'],                       'seed'),
  ('Stanford University',                        'United States', ARRAY['Stanford'],                  'seed'),
  ('Harvard University',                         'United States', ARRAY['Harvard'],                   'seed'),
  ('Princeton University',                       'United States', ARRAY['Princeton'],                 'seed'),
  ('Yale University',                            'United States', ARRAY['Yale'],                      'seed'),
  ('Columbia University',                        'United States', ARRAY['Columbia'],                  'seed'),
  ('University of Pennsylvania',                 'United States', ARRAY['UPenn','Penn'],              'seed'),
  ('Cornell University',                         'United States', ARRAY['Cornell'],                   'seed'),
  ('Brown University',                           'United States', ARRAY['Brown'],                     'seed'),
  ('Dartmouth College',                          'United States', ARRAY['Dartmouth'],                 'seed'),
  ('California Institute of Technology',         'United States', ARRAY['Caltech'],                   'seed'),
  ('University of Chicago',                      'United States', ARRAY['UChicago'],                  'seed'),
  ('Carnegie Mellon University',                 'United States', ARRAY['CMU'],                       'seed'),
  ('University of California, Berkeley',         'United States', ARRAY['UC Berkeley','Berkeley','UCB'], 'seed'),
  ('University of California, Los Angeles',      'United States', ARRAY['UCLA'],                      'seed'),
  ('University of Michigan',                     'United States', ARRAY['UMich','Michigan'],          'seed'),
  ('Georgia Institute of Technology',            'United States', ARRAY['Georgia Tech','GT'],         'seed'),
  ('New York University',                        'United States', ARRAY['NYU'],                       'seed'),
  ('Northwestern University',                    'United States', ARRAY['Northwestern'],              'seed'),
  ('Duke University',                            'United States', ARRAY['Duke'],                       'seed'),
  ('Johns Hopkins University',                   'United States', ARRAY['JHU','Johns Hopkins'],       'seed'),
  ('Purdue University',                          'United States', ARRAY['Purdue'],                     'seed'),
  ('University of Illinois Urbana-Champaign',    'United States', ARRAY['UIUC','Illinois'],           'seed'),
  ('University of Texas at Austin',              'United States', ARRAY['UT Austin','UTomA'],          'seed'),
  ('University of Southern California',          'United States', ARRAY['USC'],                       'seed'),
  ('Boston University',                          'United States', ARRAY['BU'],                        'seed'),
  ('Northeastern University',                    'United States', ARRAY['Northeastern'],              'seed'),
  -- United Kingdom
  ('University of Oxford',                       'United Kingdom', ARRAY['Oxford'],                   'seed'),
  ('University of Cambridge',                    'United Kingdom', ARRAY['Cambridge'],                'seed'),
  ('Imperial College London',                   'United Kingdom', ARRAY['Imperial'],                 'seed'),
  ('University College London',                 'United Kingdom', ARRAY['UCL'],                       'seed'),
  ('London School of Economics and Political Science', 'United Kingdom', ARRAY['LSE'],               'seed'),
  ('University of Edinburgh',                    'United Kingdom', ARRAY['Edinburgh'],                'seed'),
  ('King''s College London',                     'United Kingdom', ARRAY['KCL'],                      'seed'),
  ('University of Manchester',                   'United Kingdom', ARRAY['Manchester'],               'seed'),
  ('University of Warwick',                      'United Kingdom', ARRAY['Warwick'],                  'seed'),
  ('University of Bristol',                      'United Kingdom', ARRAY['Bristol'],                  'seed'),
  -- Canada
  ('University of Toronto',                      'Canada', ARRAY['UofT','U of T','Toronto'],          'seed'),
  ('University of British Columbia',             'Canada', ARRAY['UBC'],                              'seed'),
  ('McGill University',                          'Canada', ARRAY['McGill'],                           'seed'),
  ('University of Waterloo',                     'Canada', ARRAY['Waterloo','UW'],                    'seed'),
  ('McMaster University',                        'Canada', ARRAY['McMaster'],                         'seed'),
  -- Australia
  ('University of Melbourne',                    'Australia', ARRAY['Melbourne','UniMelb'],           'seed'),
  ('University of Sydney',                       'Australia', ARRAY['Sydney','USyd'],                 'seed'),
  ('Australian National University',             'Australia', ARRAY['ANU'],                           'seed'),
  ('University of New South Wales',              'Australia', ARRAY['UNSW'],                          'seed'),
  ('University of Queensland',                   'Australia', ARRAY['UQ'],                            'seed'),
  ('Monash University',                          'Australia', ARRAY['Monash'],                        'seed'),
  -- Singapore
  ('National University of Singapore',           'Singapore', ARRAY['NUS'],                          'seed'),
  ('Nanyang Technological University',           'Singapore', ARRAY['NTU','NTU Singapore'],          'seed'),
  ('Singapore Management University',            'Singapore', ARRAY['SMU'],                          'seed')
ON CONFLICT (name) DO NOTHING;

-- ─── ref_courses — STRICT starter list ───

INSERT INTO public.ref_courses (name) VALUES
  ('Computer Science'), ('Computer Science and Engineering'), ('Information Technology'),
  ('Data Science'), ('Artificial Intelligence and Machine Learning'),
  ('Mechanical Engineering'), ('Electrical Engineering'),
  ('Electronics and Communication Engineering'), ('Civil Engineering'),
  ('Chemical Engineering'), ('Aerospace Engineering'), ('Biotechnology'),
  ('Economics'), ('Business Administration'), ('Commerce'), ('Finance'),
  ('Accounting'), ('Law'), ('Medicine (MBBS)'), ('Nursing'), ('Pharmacy'),
  ('Biology'), ('Physics'), ('Chemistry'), ('Mathematics'), ('Statistics'),
  ('Psychology'), ('Political Science'), ('Sociology'), ('History'),
  ('English Literature'), ('Philosophy'), ('Design'), ('Architecture'),
  ('Liberal Arts'), ('Environmental Science'),
  ('Journalism and Mass Communication'), ('Hospitality Management'),
  ('Fine Arts'), ('Music'), ('Film and Media Studies')
ON CONFLICT (name) DO NOTHING;

-- ─── ref_subjects — STRICT starter list (school subjects) ───

INSERT INTO public.ref_subjects (name) VALUES
  ('Mathematics'), ('Physics'), ('Chemistry'), ('Biology'), ('Computer Science'),
  ('English'), ('Hindi'), ('Economics'), ('Business Studies'), ('Accountancy'),
  ('History'), ('Geography'), ('Political Science'), ('Sociology'), ('Psychology'),
  ('Physical Education'), ('Fine Arts'), ('Music'), ('Sanskrit'), ('French'),
  ('German'), ('Spanish'), ('Environmental Science'), ('Informatics Practices'),
  ('Statistics'), ('Legal Studies'), ('Entrepreneurship'), ('Home Science'),
  ('Geology'), ('Biotechnology')
ON CONFLICT (name) DO NOTHING;

-- ─── ref_sports — STRICT starter list ───

INSERT INTO public.ref_sports (name) VALUES
  ('Cricket'), ('Football'), ('Basketball'), ('Tennis'), ('Badminton'),
  ('Table Tennis'), ('Swimming'), ('Athletics (Track and Field)'), ('Hockey'),
  ('Volleyball'), ('Squash'), ('Chess'), ('Golf'), ('Cycling'), ('Rowing'),
  ('Boxing'), ('Wrestling'), ('Kabaddi'), ('Shooting'), ('Archery'),
  ('Gymnastics'), ('Martial Arts'), ('Skating'), ('Fencing'), ('Baseball'),
  ('Rugby'), ('Handball'), ('Sailing')
ON CONFLICT (name) DO NOTHING;

-- ─── ref_cocurriculars — STRICT starter list ───

INSERT INTO public.ref_cocurriculars (name) VALUES
  ('Debate'), ('Model United Nations'), ('Public Speaking'), ('Drama and Theatre'),
  ('Vocal Music'), ('Instrumental Music'), ('Dance'), ('Quizzing'), ('Robotics'),
  ('Coding Club'), ('Entrepreneurship Club'), ('Student Government'),
  ('Community Service'), ('Environmental Club'), ('Art and Painting'),
  ('Photography'), ('Film-making'), ('Creative Writing'),
  ('Journalism / School Newspaper'), ('Science Olympiad'), ('Mathematics Olympiad'),
  ('Cultural Fest Organising'), ('Yearbook Committee'), ('Astronomy Club'),
  ('Eco Club'), ('Social Service League')
ON CONFLICT (name) DO NOTHING;

-- ─── ref_project_categories — STRICT starter list ───

INSERT INTO public.ref_project_categories (name) VALUES
  ('Science Fair Project'), ('Engineering / Robotics Project'),
  ('Software / App Development'), ('Research Paper'), ('Social Impact Project'),
  ('Startup / Business Venture'), ('Environmental Sustainability'),
  ('Data Science / Machine Learning'), ('Hardware / IoT'),
  ('Biology / Biotechnology Research'), ('Mathematics Research'),
  ('Humanities Research'), ('Arts / Design Portfolio'), ('Community Initiative'),
  ('Open Source Contribution')
ON CONFLICT (name) DO NOTHING;
