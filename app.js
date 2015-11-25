// export express
var express = require('express')
var app = express()
module.exports = app;

// installed libs
var path = require('path')
var cookieParser = require('cookie-parser')
var router = express.Router()
var fs = require('fs')

// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'jade')

// middleware
app.use(cookieParser())
app.use('/', router)

// custom libs
var dnss = require('./lib/dnss')
var db = require('./lib/db')(dnss.settings.db)
var jobs = []
for (i in db.Jobs) {
  jobs[i] = db.Jobs[i]
}

/* redirect to job with level specified */
router.get('/:job([a-z]+)', function(req, res) {
  res.redirect(302, '/' + req.params.job + '-' + db.Levels.length)
})

var default_build_path = Array(73).join('-');
router.get('/:job([a-z]+)-:level([0-9]+)', function(req, res) {
  res.redirect(301, '/' + req.params.job + '-' + req.params.level + '/' + default_build_path);
});

/* main simulator page */
var buildChars = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_".split('');
router.get('/:job([a-z]+)-:level([0-9]+)/:build([-_a-zA-Z0-9!]{72,})', function(req, res) {
  req.params.level = parseInt(req.params.level);
  if (req.params.level < 1 || req.params.level > db.Levels.length) throw "level " + req.params.level + " not found"
  var job = jobs.filter(function(j) { return j != null && j.JobNumber == 2 && j.EnglishName == req.params.job })[0]
  if (!job) throw "job " + req.params.job + " not found"
  if (req.params.build.length > 216) throw "build path too long"

  var line = [jobs[jobs[job.ParentJob].ParentJob], jobs[job.ParentJob], job];
  var lvls = {};
  var build = req.params.build.split('');
  var skilltree = line.reduce(function(p, j) {
                    return p.concat(j.SkillTree.reduce(function($p, s) {
                                      return $p.concat(s);
                                    }, []));
                  }, []);

  var max_sp = db.Levels.slice(0, req.params.level).reduce(function(p,c) { return p+c }, 0)
  var job_max_sp = [parseInt(max_sp * db.SP[0]),
                    parseInt(max_sp * db.SP[1]),
                    parseInt(max_sp * db.SP[2])];

  var i,j, job_num = 0, job_sp = [0,0,0], baseskills = {}, skillgroups = {};
  for (i = 0, j = 0; i < 72; i++, j++) {
    var c = build[j], id = skilltree[i];
    if (id === null) {
      if (c != '-') throw "invalid build path"
      continue;
    }

    var $job, skill;
    if (i == 0) {
      $job = line[0];
    } else if (i == 24) {
      $job = line[1];
      job_num = 1;
    } else if (i == 48) {
      $job = line[2];
      job_num = 2;
    }

    skill = $job.Skills[id];

    var tech = 0;
    if (build[j + 1] == '!') { // single tech
      tech++, j++;
      if (build[j + 1] == '!') { // double tech
        tech++, j++;
      }
    }

    var maybePlus1 = skill.Levels[1].LevelLimit == 1 ? 1 : 0;
    var level = buildChars.indexOf(c) + maybePlus1;
    if (level + tech > skill.MaxLevel || (level == 0 && tech > 0)) throw "invalid build path"
    var trueMax = get_skill_max(skill, req.params.level);
    if (level > trueMax) throw "invalid build path"
    var tsp = get_skill_tsp(skill, level);
    job_sp[job_num] += tsp;
    lvls[id] = [level, trueMax, tsp, tech, skill.MaxLevel - skill.SPMaxLevel];

    if (skill.SkillGroup && level) {
      if (!skillgroups[skill.SkillGroup]) {
        skillgroups[skill.SkillGroup] = [];
      }

      skillgroups[skill.SkillGroup].push(id);
    }

    if (skill.BaseSkillID && level) {
      if (!baseskills[skill.BaseSkillID]) {
        baseskills[skill.BaseSkillID] = [];
      }

      baseskills[skill.BaseSkillID].push(id);
    }
  }

  if (j < build.length) throw "invalid build path"

  // sum of sp checks
  if (job_sp[0] > job_max_sp[0] || job_sp[1] > job_max_sp[1]
                                || job_sp[2] > job_max_sp[2]
                                || job_sp[0] + job_sp[1] + job_sp[2] > max_sp) throw "invalid build path"



  res.render('simulator', {
    title: job.JobName + ' | ' + dnss.settings.title,
    jobs: jobs,
    cap: req.params.level,
    line: line,
    fn: dnss.fn,
    sp_ratios: db.SP,
    levels: db.Levels,
    max_sp: max_sp,
    lvls: lvls,
    job_sp: job_sp,
    job_max_sp: job_max_sp,
    skillgroups: skillgroups,
    baseskills: baseskills
  })
})

// two way
function get_skill_max(skill, cap) {
  var max = 1;
  for (var i = skill.MaxLevel - skill.SPMaxLevel, j = 1; i > 0; i--, j++) {
    if (skill.Levels[i].LevelLimit <= cap) {
      return i;
    }

    if (skill.Levels[j].LevelLimit <= cap) {
      max = j;
    } else {
      break;
    }
  }

  return max;
}

function get_skill_tsp(skill, level) {
  if (level == 0) {
    return 0;
  }

  var total = 0;
  for (var i = 1; i <= level; i++) {
    total += skill.Levels[i].SkillPoint;
  }

  return total;
}