#include "zuma_api.hpp"
#include <fstream>
#include <iostream>

int main(int argc, char** argv) {
    if (argc != 2) return 1;
    zuma::Json fixtures=zuma::Json::object();
    auto add = [&](const std::string& name, zuma::Level level, zuma::SpecialOptions options, std::size_t position) {
        zuma::Game game(level, options);
        auto initial=zuma::snapshotJson(game.snapshot());
        initial.update({{"sessionId","fixture-"+name},{"version",1},{"levelId",1},{"maxLength",level.maxLength},{"specialsEnabled",!options.initialAttributes.empty()},{"specialChancePercent",30}});
        if (position) game.shoot(position); else game.discard();
        auto final=zuma::snapshotJson(game.snapshot());
        final.update({{"sessionId","fixture-"+name},{"version",2},{"levelId",1},{"maxLength",level.maxLength},{"specialsEnabled",!options.initialAttributes.empty()},{"specialChancePercent",30}});
        fixtures[name]={{"initial",initial},{"response",{{"state",final},{"events",zuma::turnEventsJson(game)},{"messages",game.events()}}}};
        if (name=="stop") {
            auto before=final;
            game.discard();
            auto after=zuma::snapshotJson(game.snapshot());
            after.update({{"sessionId","fixture-stop-skip"},{"version",3},{"levelId",1},{"maxLength",level.maxLength},{"specialsEnabled",true},{"specialChancePercent",30}});
            before["sessionId"]="fixture-stop-skip";
            fixtures["stop-skip"]={{"initial",before},{"response",{{"state",after},{"events",zuma::turnEventsJson(game)},{"messages",game.events()}}}};
        }
    };
    using zuma::Special;
    add("chain",{"RRBBRR","G",{'B','G'},12},{},4);
    add("stop-back-summary",{"RRBBRR","G",{'B','G'},12},
        {0,0,{Special::Stop,Special::Back,Special::Back,Special::None,Special::Stop,Special::None}},4);
    add("back",{"GBYRR","P",{'R'},12},{0,0,{Special::None,Special::None,Special::None,Special::Back}},6);
    add("boom",{"GBYRRPG","",{'R'},12},{0,0,{Special::None,Special::None,Special::None,Special::Boom}},5);
    add("stop",{"RR","GBYP",{'R'},12},{0,0,{Special::Stop}},2);
    add("win",{"RR","",{'R'},2},{},2);
    add("loss",{"R","G",{'B'},1},{},0);
    add("empty",{"","R",{'G'},3},{},1);
    std::ofstream file(argv[1]);file<<fixtures.dump(2);
    if(!file) return 1;
    std::cout<<"Exported core-produced animation fixtures.\n";
}
