'use strict';
module.exports = {
  OS: 'ios',
  select: (obj) => obj.ios ?? obj.default,
  Version: 14,
  isPad: false,
  isTVOS: false,
};
