// /utils/validation.js
function isEnumValid(value, enumList) {
    return value === undefined || enumList.some(opt => opt.key === value);
  }
  
  module.exports = {
    isEnumValid
  };
  