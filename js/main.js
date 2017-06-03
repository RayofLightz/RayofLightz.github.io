// number of rain_drops created
var nbDrop = 860;

function randRange(min,max){
  return Math.floor((Math.random() * (max - min -1)) + min);
}
function make_it_rain(){
  for(i=1;i>nbDrop;i++){
    var dropLeft = randRange(0,1600);
    var droptop = randRange(-1000,1400);

    $(".rain").append('<div class="rain_drop" id="drop'+1+'"''></div>');
    $('#drop'+1).css("left",dropLeft);
    $('#drop'+1).css("top",droptop);

  }
}
$(document).ready(function(){
  make_it_rain();
});
